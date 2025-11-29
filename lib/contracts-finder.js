// Contracts Finder API Integration

// ==========================================
// 1. FETCH TENDERS FROM CONTRACTS FINDER API
// ==========================================

export async function fetchAdaptationTenders() {
  const baseUrl = 'https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search';
  
  const keywords = [
    'DFG',
    'disabled facilities grant',
    'adaptation framework',
    'minor adaptations',
    'level access',
    'wet room',
    'bathroom adaptations',
    'mobility adaptations',
    'disabled adaptations',
    'disability adaptations',
    'home adaptations',
    'accessible adaptations'
  ].join(' OR ');
  
  const locations = [
    'Birmingham',
    'Dudley',
    'Sandwell',
    'Walsall',
    'Wolverhampton',
    'Solihull',
    'Coventry'
  ];
  
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 30);
  const dateFrom = sevenDaysAgo.toISOString().split('T')[0];
  
  try {
    const allTenders = [];
    
    for (const location of locations) {
      const params = new URLSearchParams({
        keyword: keywords,
        location: location,
        publishedFrom: dateFrom,
        limit: 100
      });
      
      const response = await fetch(`${baseUrl}?${params}`);
      
      if (!response.ok) {
        console.error(`Failed to fetch for ${location}:`, response.status);
        continue;
      }
      
      const data = await response.json();
      
      if (data.releases) {
        const tenders = data.releases.map(release => ({
          id: release.ocid,
          title: release.tender?.title || 'Untitled',
          description: release.tender?.description || '',
          buyer: release.buyer?.name || 'Unknown',
          value: release.tender?.value?.amount || null,
          deadline: release.tender?.enquiryPeriod?.endDate || release.tender?.tenderPeriod?.endDate,
          url: `https://www.contractsfinder.service.gov.uk/notice/${release.ocid}`,
          location: location
        }));
        
        allTenders.push(...tenders);
      }
    }
    
    console.log(`Fetched ${allTenders.length} tenders`);
    return allTenders;
    
  } catch (error) {
    console.error('Error fetching tenders:', error);
    return [];
  }
}

// ==========================================
// 2. QUALIFY TENDER AGAINST USER PROFILE
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
      passes.push(`Your turnover (£${profile.turnover.toLocaleString()}) exceeds 3x contract value (£${tender.value.toLocaleString()})`);
    } else if (turnoverMultiple >= 1.5) {
      score += 5;
      passes.push(`Your turnover (£${profile.turnover.toLocaleString()}) covers contract value with good margin`);
    } else if (turnoverMultiple >= 1) {
      score += 2;
      passes.push(`Your turnover (£${profile.turnover.toLocaleString()}) matches contract value`);
    } else if (turnoverMultiple >= 0.5) {
      issues.push(`Your turnover (£${profile.turnover.toLocaleString()}) is below contract value (£${tender.value.toLocaleString()}) - risky`);
      score -= 3;
    } else {
      issues.push(`Your turnover is far below this contract value - unlikely to qualify`);
      score -= 10;
    }
  }
  
  // INSURANCE CHECK (Critical requirement)
  const requiredInsurance = 5000000; // £5M minimum
  if (profile.publicLiability >= requiredInsurance) {
    score += 15;
    passes.push(`You have required £${requiredInsurance.toLocaleString()} public liability insurance`);
  } else {
    issues.push(`You need £${requiredInsurance.toLocaleString()} public liability insurance (you have £${profile.publicLiability.toLocaleString()})`);
    score -= 20;
  }
  
  // EXPERIENCE CHECK
  if (profile.yearsAdaptations >= 5) {
    score += 10;
    passes.push(`${profile.yearsAdaptations} years experience in adaptation work`);
  } else if (profile.yearsAdaptations >= 3) {
    score += 5;
    passes.push(`${profile.yearsAdaptations} years experience (some councils prefer 5+ years)`);
  } else if (profile.yearsAdaptations >= 1) {
    score -= 5;
    issues.push(`Only ${profile.yearsAdaptations} year(s) experience (many councils require 5+ years)`);
  } else {
    score -= 15;
    issues.push(`Insufficient experience in adaptation work`);
  }
  
  // SAFEGUARDING POLICY (Required for vulnerable tenants work)
  if (profile.hasSafeguarding) {
    score += 8;
    passes.push(`You have a safeguarding policy (required for vulnerable tenants)`);
  } else {
    issues.push(`Missing safeguarding policy (required for many councils)`);
    score -= 15;
  }
  
  // DBS CHECKS (Required for housing work)
  if (profile.hasDBSChecks) {
    score += 8;
    passes.push(`Your staff have enhanced DBS checks`);
  } else {
    issues.push(`Staff need enhanced DBS checks for housing work`);
    score -= 10;
  }
  
  // HEALTH & SAFETY (CDM 2015)
  if (profile.hasHealthSafety) {
    score += 7;
    passes.push(`You have CDM 2015 compliant Health & Safety Policy`);
  } else {
    issues.push(`Missing Health & Safety Policy (CDM 2015 required)`);
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
  
  return {
    tender: {
      id: tender.id,
      title: tender.title,
      description: tender.description,
      buyer: tender.buyer,
      value: tender.value,
      deadline: tender.deadline,
      url: tender.url,
      location: tender.location
    },
    score,
    status,
    passes,
    issues
  };
}
