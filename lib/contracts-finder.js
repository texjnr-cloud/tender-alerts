// Contracts Finder API Integration

const WEST_MIDLANDS_COUNCILS = [
  'Birmingham',
  'Dudley',
  'Sandwell',
  'Walsall',
  'Wolverhampton',
  'Solihull',
  'Coventry'
];

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
  'stairlift'
];

const EXCLUDE_KEYWORDS = [
  'it system',
  'software',
  'legal services',
  'audit'
];

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
    
    // Just try ONE location for now
    const location = 'Birmingham';
    
    const params = new URLSearchParams({
      keyword: keywords,
      location: location,
      publishedFrom: dateFrom,
      limit: 100
    });
    
    console.log(`\n=== Fetching from Contracts Finder ===`);
    console.log(`URL: ${baseUrl}?${params}`);
    console.log(`Location: ${location}`);
    console.log(`Keywords: ${keywords}`);
    console.log(`Date from: ${dateFrom}`);
    
    const response = await fetch(`${baseUrl}?${params}`);
    console.log(`Response status: ${response.status}`);
    
    if (!response.ok) {
      console.error(`API returned error: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    console.log(`\n=== RAW API RESPONSE ===`);
    console.log(data);
    
    if (!data.releases) {
      console.log(`\nNo releases in response!`);
      return [];
    }
    
    console.log(`\n=== PROCESSING ${data.releases.length} RELEASES ===`);
    
    data.releases.forEach((release, idx) => {
      console.log(`\n[Release ${idx}]`);
      console.log(`Title: ${release.tender?.title}`);
      console.log(`ID: ${release.ocid}`);
      console.log(`Deadline: ${release.tender?.enquiryPeriod?.endDate || release.tender?.tenderPeriod?.endDate}`);
      console.log(`Description: ${release.tender?.description?.substring(0, 100)}`);
      
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
      
      // Check deadline
      const hasDeadline = hasFutureDeadline(tender);
      console.log(`Has future deadline: ${hasDeadline}`);
      if (!hasDeadline) {
        console.log(`  → FILTERED OUT: no future deadline`);
        return;
      }
      
      // Check relevance
      const relevant = isRelevantAdaptationTender(tender);
      console.log(`Is relevant: ${relevant}`);
      if (!relevant) {
        console.log(`  → FILTERED OUT: not relevant`);
        return;
      }
      
      console.log(`  → PASSED FILTERS`);
      seenIds.add(tender.id);
      allTenders.push(tender);
    });
    
    console.log(`\n=== FINAL RESULT ===`);
    console.log(`Total from API: ${data.releases.length}`);
    console.log(`After filtering: ${allTenders.length}`);
    
    return allTenders;
    
  } catch (error) {
    console.error('Error fetching tenders:', error);
    return [];
  }
}

function hasFutureDeadline(tender) {
  if (!tender.deadline) {
    console.log(`  No deadline found`);
    return false;
  }
  
  try {
    const deadlineDate = new Date(tender.deadline);
    const now = new Date();
    const isFuture = deadlineDate > now;
    
    console.log(`  Deadline date: ${deadlineDate}`);
    console.log(`  Now: ${now}`);
    console.log(`  Is future: ${isFuture}`);
    
    return isFuture;
  } catch (e) {
    console.error(`Date parse error:`, tender.deadline, e);
    return false;
  }
}

function isRelevantAdaptationTender(tender) {
  const text = `${tender.title} ${tender.description}`.toLowerCase();
  
  const hasExclude = EXCLUDE_KEYWORDS.some(keyword => text.includes(keyword));
  if (hasExclude) {
    console.log(`  Found exclude keyword`);
    return false;
  }
  
  const hasCore = CORE_ADAPTATION_KEYWORDS.some(keyword => text.includes(keyword));
  console.log(`  Has core adaptation keyword: ${hasCore}`);
  
  return hasCore;
}

export async function qualifyTender(tender, profile) {
  let score = 0;
  const passes = [];
  const issues = [];
  
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
  
  const requiredInsurance = 5000000;
  if (profile.publicLiability >= requiredInsurance) {
    score += 15;
    passes.push(`You have required £${requiredInsurance.toLocaleString()} public liability insurance`);
  } else {
    issues.push(`You need £${requiredInsurance.toLocaleString()} public liability insurance`);
    score -= 20;
  }
  
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
  
  if (profile.hasSafeguarding) {
    score += 8;
    passes.push(`You have a safeguarding policy`);
  } else {
    issues.push(`Missing safeguarding policy`);
    score -= 15;
  }
  
  if (profile.hasDBSChecks) {
    score += 8;
    passes.push(`Your staff have enhanced DBS checks`);
  } else {
    issues.push(`Staff need enhanced DBS checks`);
    score -= 10;
  }
  
  if (profile.hasHealthSafety) {
    score += 7;
    passes.push(`You have CDM 2015 compliant Health & Safety Policy`);
  } else {
    issues.push(`Missing Health & Safety Policy (CDM 2015)`);
    score -= 8;
  }
  
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
  
  if (tender.location && profile.location.toLowerCase().includes(tender.location.toLowerCase())) {
    score += 3;
    passes.push(`Local to ${tender.location}`);
  }
  
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
