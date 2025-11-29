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

// CORE adaptation keywords - must have at least ONE of these
const CORE_ADAPTATION_KEYWORDS = [
  'dfg',
  'disabled facilities',
  'adaptation',
  'accessible',
  'mobility',
  'wheelchair',
  'ramp',
  'bathroom',
  'wet room',
  'level access',
  'grab rail',
  'stairlift'
];

// SECONDARY keywords - pair with core keywords for relevance
const SECONDARY_KEYWORDS = [
  'housing',
  'home',
  'property',
  'works',
  'installation',
  'contract'
];

// Keywords to EXCLUDE (false positives)
const EXCLUDE_KEYWORDS = [
  'it system',
  'software',
  'legal services',
  'audit',
  'consultancy only',
  'design only',
  'survey only'
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
    'bathroom'
  ].join(' OR ');
  
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 30);
  const dateFrom = sevenDaysAgo.toISOString().split('T')[0];
  
  try {
    const allTenders = [];
    const seenIds = new Set();
    
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
            // Avoid duplicates
            if (seenIds.has(tender.id)) {
              return false;
            }
            
            // MUST have a future deadline
            if (!hasFutureDeadline(tender)) {
              console.log(`Filtered out (closed/past deadline): ${tender.title}`);
              return false;
            }
            
            // Must be relevant to adaptations
            if (!isRelevantAdaptationTender(tender)) {
              console.log(`Filtered out (not adaptation-related): ${tender.title}`);
              return false;
            }
            
            seenIds.add(tender.id);
            return true;
          });
        
        allTenders.push(...tenders);
      }
    }
    
    console.log(`Fetched ${allTenders.length} unique, open adaptation tenders from West Midlands councils`);
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
    // No deadline info = uncertain, filter it out to be safe
    return false;
  }
  
  try {
    const deadlineDate = new Date(tender.deadline);
    const now = new Date();
    
    // Deadline must be in the future
    return deadlineDate > now;
  } catch (e) {
    console.error(`Could not parse deadline for ${tender.title}:`, tender.deadline);
    return false;
  }
}

// ==========================================
// 3. CHECK IF TENDER IS ADAPTATION-RELATED
// ==========================================

function isRelevantAdaptationTender(tender) {
  const text = `${tender.title} ${tender.description}`.toLowerCase();
  
  // Filter out explicitly
  const hasExcludeKeyword = EXCLUDE_KEYWORDS.some(keyword => text.includes(keyword));
  if (hasExcludeKeyword) {
    return false;
  }
  
  // MUST have at least one core adaptation keyword
  const hasCoreKeyword = CORE_ADAPTATION_KEYWORDS.some(keyword => text.includes(keyword));
  if (!hasCoreKeyword) {
    return false;
  }
  
  // If it has a core keyword, it's relevant
  // (no need to require secondary keywords - core keywords are specific enough)
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
