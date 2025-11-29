// Contracts Finder API Integration
// MVP Version - Show real tenders with minimal filtering

const WEST_MIDLANDS_COUNCILS = [
  'Birmingham',
  'Dudley',
  'Sandwell',
  'Walsall',
  'Wolverhampton',
  'Solihull',
  'Coventry'
];

// Loose keywords - just to help narrow search a bit
const SEARCH_KEYWORDS = [
  'housing',
  'construction',
  'works',
  'maintenance',
  'services'
];

export async function fetchAdaptationTenders() {
  const baseUrl = 'https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search';
  
  const allTenders = [];
  const seenIds = new Set();
  
  try {
    // Fetch from all West Midlands councils
    for (const location of WEST_MIDLANDS_COUNCILS) {
      console.log(`\nFetching tenders for ${location}...`);
      
      const params = new URLSearchParams({
        location: location,
        publishedFrom: getDateFrom(),
        limit: 100
      });
      
      const url = `${baseUrl}?${params}`;
      console.log(`URL: ${url}`);
      
      try {
        const response = await fetch(url);
        
        if (!response.ok) {
          console.log(`API returned ${response.status} for ${location}`);
          continue;
        }
        
        const data = await response.json();
        const tenderCount = data.releases?.length || 0;
        console.log(`Got ${tenderCount} tenders from ${location}`);
        
        if (data.releases && Array.isArray(data.releases)) {
          data.releases.forEach(release => {
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
            
            // Only filter: avoid duplicates and check for future deadline
            if (!seenIds.has(tender.id) && hasFutureDeadline(tender)) {
              seenIds.add(tender.id);
              allTenders.push(tender);
              console.log(`✓ Added: ${tender.title}`);
            }
          });
        }
      } catch (e) {
        console.error(`Error fetching ${location}:`, e.message);
        continue;
      }
    }
    
    console.log(`\n=== FINAL RESULT ===`);
    console.log(`Total tenders with future deadlines: ${allTenders.length}`);
    
    return allTenders;
    
  } catch (error) {
    console.error('Error in fetchAdaptationTenders:', error);
    return [];
  }
}

function getDateFrom() {
  const date = new Date();
  date.setDate(date.getDate() - 90); // Last 90 days
  return date.toISOString().split('T')[0];
}

function hasFutureDeadline(tender) {
  if (!tender.deadline) {
    return false;
  }
  
  try {
    const deadlineDate = new Date(tender.deadline);
    const now = new Date();
    return deadlineDate > now;
  } catch (e) {
    return false;
  }
}

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
    passes.push(`${profile.yearsAdaptations} years experience`);
  } else if (profile.yearsAdaptations >= 1) {
    score -= 5;
    issues.push(`Only ${profile.yearsAdaptations} year(s) experience (5+ preferred)`);
  } else {
    score -= 15;
    issues.push(`Insufficient experience in adaptation work`);
  }
  
  // SAFEGUARDING
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
  
  // STATUS DETERMINATION
  let status = 'red';
  
  if (profile.publicLiability < 5000000 || profile.yearsAdaptations < 1) {
    status = 'red';
  } else if (!profile.hasSafeguarding || !profile.hasDBSChecks || !profile.hasHealthSafety) {
    status = 'amber';
  } else if (score >= 25) {
    status = 'green';
  } else if (score >= 15) {
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
