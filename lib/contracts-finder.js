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

// Keywords that indicate adaptation/DFG work
const ADAPTATION_KEYWORDS = [
  'dfg',
  'disabled',
  'adaptation',
  'accessible',
  'mobility',
  'wheelchair',
  'ramp',
  'bathroom',
  'wet room',
  'level access',
  'grab rail',
  'stairlift',
  'extension',
  'housing',
  'home',
  'council'
];

// Keywords to EXCLUDE (false positives)
const EXCLUDE_KEYWORDS = [
  'it system',
  'software license',
  'legal services',
  'audit services'
];

// ==========================================
// 1. FETCH TENDERS FROM CONTRACTS FINDER API
// ==========================================

export async function fetchAdaptationTenders() {
  const baseUrl = 'https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search';
  
  const keywords = [
    'DFG',
    'adaptation',
    'disabled',
    'accessible',
    'bathroom',
    'housing'
  ].join(' OR ');
  
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 30);
  const dateFrom = sevenDaysAgo.toISOString().split('T')[0];
  
  try {
    const allTenders = [];
    const seenIds = new Set(); // Track tender IDs to avoid duplicates
    
    for (const location of WEST_MIDLANDS_COUNCILS) {
      const params = new URLSearchParams({
        keyword: keywords,
        location: location,
        publishedFrom: dateFrom,
        limit: 100
      });
      
      console.log(`Fetching tenders for ${location}...`);
      const response = await fetch(`${baseUrl}?${params}`);
      
      if (!response.ok) {
        console.error(`Failed to fetch for ${location}:`, response.status);
        continue;
      }
      
      const data = await response.json();
      console.log(`Got ${data.releases?.length || 0} tenders for ${location}`);
      
      if (data.releases) {
        const tenders = data.releases
          .map(release => ({
            id: release.ocid,
            title: release.tender?.title || 'Untitled',
            description: release.tender?.description || '',
            buyer: release.buyer?.name || 'Unknown',
            value: release.tender?.value?.amount || null,
            deadline: release.tender?.enquiryPeriod?.endDate || release.tender?.tenderPeriod?.endDate,
            status: release.tender?.status || 'unknown',
            location: location
          }))
          .filter(tender => {
            // Check if we've already seen this tender
            if (seenIds.has(tender.id)) {
              return false;
            }
            
            // Only filter out obviously closed tenders
            if (shouldFilterOut(tender)) {
              return false;
            }
            
            // Check if it looks like a relevant tender
            if (!looksRelevant(tender)) {
              return false;
            }
            
            // Mark as seen
            seenIds.add(tender.id);
            return true;
          });
        
        allTenders.push(...tenders);
      }
    }
    
    console.log(`Fetched ${allTenders.length} unique tenders from West Midlands councils`);
    return allTenders;
    
  } catch (error) {
    console.error('Error fetching tenders:', error);
    return [];
  }
}

// ==========================================
// 2. ONLY FILTER OUT OBVIOUSLY CLOSED TENDERS
// ==========================================

function shouldFilterOut(tender) {
  // Only filter if status explicitly says cancelled/closed/withdrawn
  if (tender.status) {
    const status = tender.status.toLowerCase();
    if (status.includes('cancel') || status.includes('withdrawn')) {
      return true;
    }
  }
  
  // Only filter if deadline is MORE than 7 days in the past
  if (tender.deadline) {
    try {
      const deadlineDate = new Date(tender.deadline);
      const now = new Date();
      const daysAgo = (now - deadlineDate) / (1000 * 60 * 60 * 24);
      
      if (daysAgo > 7) {
        return true;
      }
    } catch (e) {
      // If date parsing fails, don't filter it out
    }
  }
  
  return false;
}

// ==========================================
// 3. CHECK IF TENDER LOOKS RELEVANT
// ==========================================

function looksRelevant(tender) {
  const text = `${tender.title} ${tender.description}`.toLowerCase();
  
  // Must contain at least one adaptation keyword
  const hasKeyword = ADAPTATION_KEYWORDS.some(keyword => text.includes(keyword));
  
  if (!hasKeyword) {
    console.log(`Filtered out (no keywords): ${tender.title}`);
    return false;
  }
  
  // Must NOT contain exclude keywords
  const hasExcludeKeyword = EXCLUDE_KEYWORDS.some(keyword => text.includes(keyword));
  
  if (hasExcludeKeyword) {
    console.log(`Filtered out (excluded): ${tender.title}`);
    return false;
  }
  
  return true;
}

// ==========================================
// 4. QUALIFY TENDER AGAINST USER PROFILE
// ==========================================

export async function qualifyTender(tender, profile) {
  let score = 0;
  const passes = [];
  const issues = [];
  
  // TURNOVER CHECK (Important for larger contracts)
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
  
  // INSURANCE CHECK (Critical requirement)
  const requiredInsurance = 5000000; // £5M minimum
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
  
  // SAFEGUARDING POLICY (Required for vulnerable tenants work)
  if (profile.hasSafeguarding) {
    score += 8;
    passes.push(`You have a safeguarding policy`);
  } else {
    issues.push(`Missing safeguarding policy`);
    score -= 15;
  }
  
  // DBS CHECKS (Required for housing work)
  if (profile.hasDBSChecks) {
    score += 8;
    passes.push(`Your staff have enhanced DBS checks`);
  } else {
    issues.push(`Staff need enhanced DBS checks`);
    score -= 10;
  }
  
  // HEALTH & SAFETY (CDM 2015)
  if (profile.hasHealthSafety) {
    score += 7;
    passes.push(`You have CDM 2015 compliant Health & Safety Policy`);
  } else {
    issues.push(`Missing Health & Safety Policy (CDM 2015)`);
    score -= 8;
  }
  
  // ACCREDITATIONS (Bonus points)
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
  
  // LOCATION BONUS (if matches tender location)
  if (tender.location && profile.location.toLowerCase().includes(tender.location.toLowerCase())) {
    score += 3;
    passes.push(`Local to ${tender.location}`);
  }
  
  // DETERMINE STATUS based on critical requirements
  let status = 'red';
  
  // Red = missing critical requirements
  if (profile.publicLiability < 5000000 || profile.yearsAdaptations < 1) {
    status = 'red';
  }
  // Amber = has most things but missing some
  else if (!profile.hasSafeguarding || !profile.hasDBSChecks || !profile.hasHealthSafety) {
    status = 'amber';
  }
  // Green = has all critical requirements and good score
  else if (score >= 25) {
    status = 'green';
  }
  // Amber = has requirements but lower score
  else if (score >= 15) {
    status = 'amber';
  }
  
  // Build the correct Contracts Finder URL using OCID
  // Format: https://www.contractsfinder.service.gov.uk/notice/{ocid}?origin=SearchResults
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
