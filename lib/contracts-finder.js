// Contracts Finder API Integration

// West Midlands councils list
const WEST_MIDLANDS_COUNCILS = [
  'Birmingham',
  'Dudley',
  'Sandwell',
  'Walsall',
  'Wolverhampton',
  'Solihull',
  'Coventry'
];

// CORE adaptation keywords
const CORE_ADAPTATION_KEYWORDS = [
  'dfg',
  'disabled facilities',
  'disabled',
  'adaptation',
  'adaptations',
  'accessible',
  'accessibility',
  'mobility',
  'wheelchair',
  'ramp',
  'bathroom',
  'wet room',
  'level access',
  'grab rail',
  'stairlift',
  'accessible housing'
];

// Keywords to EXCLUDE
const EXCLUDE_KEYWORDS = [
  'it system',
  'software',
  'legal services',
  'audit'
];

// ==========================================
// 1. FETCH TENDERS FROM CONTRACTS FINDER API
// ==========================================

export async function fetchAdaptationTenders() {
  const baseUrl = 'https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search';
  
  const keywords = [
    'DFG',
    'disabled facilities',
    'adaptation',
    'accessible',
    'bathroom',
    'disabled'
  ].join(' OR ');
  
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 30);
  const dateFrom = sevenDaysAgo.toISOString().split('T')[0];
  
  try {
    const allTenders = [];
    const seenIds = new Set();
    let totalFetched = 0;
    let totalFiltered = 0;
    
    for (const location of WEST_MIDLANDS_COUNCILS) {
      const params = new URLSearchParams({
        keyword: keywords,
        location: location,
        publishedFrom: dateFrom,
        limit: 100
      });
      
      console.log(`\n=== Fetching tenders for ${location} ===`);
      const response = await fetch(`${baseUrl}?${params}`);
      
      if (!response.ok) {
        console.error(`Failed to fetch for ${location}:`, response.status);
        continue;
      }
      
      const data = await response.json();
      const tenderCount = data.releases?.length || 0;
      totalFetched += tenderCount;
      console.log(`Got ${tenderCount} tenders from API for ${location}`);
      
      if (data.releases) {
        data.releases.forEach((release, idx) => {
          const tender = {
            id: release.ocid,
            title: release.tender?.title || 'Untitled',
            description: release.tender?.description || '',
            buyer: release.buyer?.name || 'Unknown',
            value: release.tender?.value?.amount || null,
            deadline: release.tender?.enquiryPeriod?.endDate || release.tender?.tenderPeriod?.endDate,
            status: release.tender?.status || 'unknown',
            location: location
          };
          
          // Check for duplicates
          if (seenIds.has(tender.id)) {
            console.log(`  [${idx}] DUPLICATE: ${tender.title}`);
            totalFiltered++;
            return;
          }
          
          // Check deadline
          const deadlineOk = hasFutureDeadline(tender);
          if (!deadlineOk) {
            console.log(`  [${idx}] NO FUTURE DEADLINE: ${tender.title} (deadline: ${tender.deadline})`);
            totalFiltered++;
            return;
          }
          
          // Check relevance
          const relevant = isRelevantAdaptationTender(tender);
          if (!relevant) {
            console.log(`  [${idx}] NOT RELEVANT: ${tender.title}`);
            totalFiltered++;
            return;
          }
          
          console.log(`  [${idx}] PASS: ${tender.title}`);
          seenIds.add(tender.id);
          allTenders.push(tender);
        });
      }
    }
    
    console.log(`\n=== SUMMARY ===`);
    console.log(`Total fetched from API: ${totalFetched}`);
    console.log(`Total filtered out: ${totalFiltered}`);
    console.log(`Final results: ${allTenders.length}`);
    
    return allTenders;
    
  } catch (error) {
    console.error('Error fetching tenders:', error);
    return [];
  }
}

// ==========================================
// 2. CHECK IF DEADLINE IS IN THE FUTURE
// ==========================================

function hasFutureDeadline(tender) {
  if (!tender.deadline) {
    return false;
  }
  
  try {
    const deadlineDate = new Date(tender.deadline);
    const now = new Date();
    const isInFuture = deadlineDate > now;
    
    return isInFuture;
  } catch (e) {
    console.error(`Date parse error for ${tender.title}:`, tender.deadline);
    return false;
  }
}

// ==========================================
// 3. CHECK IF TENDER IS ADAPTATION-RELATED
// ==========================================

function isRelevantAdaptationTender(tender) {
  const text = `${tender.title} ${tender.description}`.toLowerCase();
  
  // Check excludes
  const hasExclude = EXCLUDE_KEYWORDS.some(keyword => text.includes(keyword));
  if (hasExclude) {
    return false;
  }
  
  // Check core keywords
  const hasCore = CORE_ADAPTATION_KEYWORDS.some(keyword => text.includes(keyword));
  
  return hasCore;
}

// ==========================================
// 4. QUALIFY TENDER AGAINST USER PROFILE
// ==========================================

export async function qualifyTender(tender, profile) {
  let score = 0;
  const passes = [];
  const issues = [];
  
  // TURNOVER CHECK
  if (tender.value) {
    const turnoverMultiple = profile.turnover / tender.value;
    if (turnoverMultiple >= 3) {
      score += 10;
      passes.push(`Your turnover (£${profile.turnover.toLocaleString()}) exceeds 3x contract value`);
    } else if (turnoverMultiple >= 1.5) {
      score += 5;
      passes.push(`Your turnover covers contract value with good margin`);
    } else if (turnoverMultiple >= 1) {
      score += 2;
      passes.push(`Your turnover matches contract value`);
    } else if (turnoverMultiple >= 0.5) {
      issues.push(`Your turnover is below contract value - risky`);
      score -= 3;
    } else {
      issues.push(`Your turnover is far below this contract value`);
      score -= 10;
    }
  }
  
  // INSURANCE CHECK
  const requiredInsurance = 5000000;
  if (profile.publicLiability >= requiredInsurance) {
    score += 15;
    passes.push(`You have required £${requiredInsurance.toLocaleString()} public liability insurance`);
  } else {
    issues.push(`You need £${requiredInsurance.toLocaleString()} public liability insurance`);
    score -= 20;
  }
  
  // EXPERIENCE CHECK
  if (profile.yearsAdaptations >= 5) {
    score += 10;
    passes.push(`${profile.yearsAdaptations} years experience in adaptation work`);
  } else if (profile.yearsAdaptations >= 3) {
    score += 5;
    passes.push(`${profile.yearsAdaptations} years experience (councils prefer 5+ years)`);
  } else if (profile.yearsAdaptations >= 1) {
    score -= 5;
    issues.push(`Only ${profile.yearsAdaptations} year(s) experience (many councils require 5+)`);
  } else {
    score -= 15;
    issues.push(`Insufficient experience in adaptation work`);
  }
  
  // SAFEGUARDING POLICY
  if (profile.hasSafeguarding) {
    score += 8;
    passes.push(`You have a safeguarding policy`);
  } else {
    issues.push(`Missing safeguarding policy`);
    score -= 15;
  }
  
  // DBS CHECKS
  if (profile.hasDBSChecks) {
    score += 8;
    passes.push(`Your staff have enhanced DBS checks`);
  } else {
    issues.push(`Staff need enhanced DBS checks`);
    score -= 10;
  }
  
  // HEALTH & SAFETY
  if (profile.hasHealthSafety) {
    score += 7;
    passes.push(`You have CDM 2015 compliant Health & Safety Policy`);
  } else {
    issues.push(`Missing Health & Safety Policy (CDM 2015)`);
    score -= 8;
  }
  
  // ACCREDITATIONS
  let accreditationBonus = 0;
  if (profile.hasCHAS) {
    accreditationBonus += 5;
    passes.push(`CHAS accreditation`);
  }
  if (profile.hasSMAS) {
    accreditationBonus += 5;
    passes.push(`SMAS accreditation`);
  }
  if (profile.hasConstructionline) {
    accreditationBonus += 5;
    passes.push(`Constructionline registration`);
  }
  if (profile.hasSafeContractor) {
    accreditationBonus += 5;
    passes.push(`SafeContractor accreditation`);
  }
  
  if (accreditationBonus > 0) {
    score += accreditationBonus;
  }
  
  // LOCATION BONUS
  if (tender.location && profile.location.toLowerCase().includes(tender.location.toLowerCase())) {
    score += 3;
    passes.push(`Local to ${tender.location}`);
  }
  
  // DETERMINE STATUS
  let status = 'red';
  
  if (profile.publicLiability < 5000000 || profile.yearsAdaptations < 1) {
    status = 'red';
  }
  else if (!profile.hasSafeguarding || !profile.hasDBSChecks || !profile.hasHealthSafety) {
    status = 'amber';
  }
  else if (score >= 25) {
    status = 'green';
  }
  else if (score >= 15) {
    status = 'amber';
  }
  
  const tenderUrl = `https://www.contractsfinder.service.gov.uk/notice/${tender.id}?origin=SearchResults`;
  
  return {
    tender: {
      id: tender.id,
      title: tender.title,
      description: tender.description,
      buyer: tender.buyer,
      value: tender.value,
      deadline: tender.deadline,
      url: tenderUrl,
      location: tender.location
    },
    score,
    status,
    passes,
    issues
  };
}
