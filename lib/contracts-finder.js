// Contracts Finder API Integration with Supabase Database

// ==========================================
// SUPABASE CLIENT SETUP
// ==========================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

async function supabaseQuery(query, params = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    ...params
  });
  
  if (!response.ok) {
    throw new Error(`Supabase error: ${response.status}`);
  }
  
  return response.json();
}

// ==========================================
// 1. FETCH TENDERS FROM CONTRACTS FINDER API
// ==========================================

async function fetchAdaptationTenders() {
  const baseUrl = 'https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search';
  
  const keywords = [
    'disabled adaptations',
    'wet room',
    'level access',
    'bathroom adaptations',
    'DFG',
    'disabled facilities',
    'mobility adaptations',
    'accessible housing'
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
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
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
          currency: release.tender?.value?.currency || 'GBP',
          publishedDate: release.date,
          deadline: release.tender?.tenderPeriod?.endDate || null,
          location: location,
          url: `https://www.contractsfinder.service.gov.uk/notice/${release.ocid}`,
          cpvCodes: release.tender?.items?.map(item => item.classification?.id) || [],
          status: release.tender?.status
        }));
        
        allTenders.push(...tenders);
      }
    }
    
    const uniqueTenders = Array.from(
      new Map(allTenders.map(t => [t.id, t])).values()
    );
    
    const openTenders = uniqueTenders.filter(t => 
      t.status === 'active' && 
      (!t.deadline || new Date(t.deadline) > new Date())
    );
    
    console.log(`Found ${openTenders.length} open tenders`);
    return openTenders;
    
  } catch (error) {
    console.error('Error fetching tenders:', error);
    return [];
  }
}

// ==========================================
// 2. QUALIFY TENDER AGAINST BUILDER PROFILE
// ==========================================

async function qualifyTender(tender, builderProfile) {
  const description = (tender.title + ' ' + tender.description).toLowerCase();
  
  let annualValue = tender.value;
  const durationMatch = description.match(/(\d+)\s*year/i);
  if (durationMatch && tender.value) {
    const years = parseInt(durationMatch[1]);
    annualValue = tender.value / years;
  }
  
  const issues = [];
  const passes = [];
  
  // Check turnover
  if (annualValue && builderProfile.turnover) {
    if (builderProfile.turnover >= annualValue) {
      passes.push(`Turnover £${builderProfile.turnover.toLocaleString()} exceeds estimated annual value £${Math.round(annualValue).toLocaleString()}`);
    } else {
      issues.push(`Turnover £${builderProfile.turnover.toLocaleString()} may be below required £${Math.round(annualValue).toLocaleString()}`);
    }
  }
  
  // Check SSIP
  const requiresSSIP = description.includes('chas') || 
                       description.includes('smas') || 
                       description.includes('ssip') ||
                       description.includes('constructionline');
  
  if (requiresSSIP) {
    const hasSSIP = builderProfile.hasCHAS || 
                    builderProfile.hasSMAS || 
                    builderProfile.hasConstructionline ||
                    builderProfile.hasSafeContractor;
    
    if (hasSSIP) {
      passes.push('SSIP accreditation requirement met');
    } else {
      issues.push('CRITICAL: SSIP accreditation required');
    }
  }
  
  // Check insurance
  const requiresInsurance = description.match(/£(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:m|million)/i);
  if (requiresInsurance && builderProfile.publicLiability) {
    const requiredAmount = parseFloat(requiresInsurance[1].replace(',', '')) * 1000000;
    if (builderProfile.publicLiability >= requiredAmount) {
      passes.push(`Public Liability £${(builderProfile.publicLiability/1000000).toFixed(1)}M meets requirement`);
    } else {
      issues.push(`Public Liability insurance may be insufficient`);
    }
  }
  
  // Check experience
  const requiresExperience = description.match(/(\d+)\s*(?:\+)?\s*years?\s*experience/i);
  if (requiresExperience && builderProfile.yearsAdaptations) {
    const requiredYears = parseInt(requiresExperience[1]);
    if (builderProfile.yearsAdaptations >= requiredYears) {
      passes.push(`${builderProfile.yearsAdaptations} years experience meets ${requiredYears}+ requirement`);
    } else {
      issues.push(`May need ${requiredYears}+ years experience`);
    }
  }
  
  // Check safeguarding
  const requiresSafeguarding = description.includes('safeguarding') || 
                                description.includes('dbs') ||
                                description.includes('vulnerable');
  
  if (requiresSafeguarding) {
    if (builderProfile.hasSafeguarding && builderProfile.hasDBSChecks) {
      passes.push('Safeguarding and DBS requirements met');
    } else {
      issues.push('Safeguarding policy and DBS checks may be required');
    }
  }
  
  // Determine status
  let status;
  if (issues.some(i => i.includes('CRITICAL'))) {
    status = 'red';
  } else if (issues.length === 0) {
    status = 'green';
  } else if (issues.length <= 2) {
    status = 'amber';
  } else {
    status = 'red';
  }
  
  return {
    tender,
    status,
    passes,
    issues,
    score: passes.length - issues.length
  };
}

// ==========================================
// 3. SEND EMAIL ALERTS
// ==========================================

async function sendEmailAlert(user, matches) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  
  const greenMatches = matches.filter(m => m.status === 'green');
  const amberMatches = matches.filter(m => m.status === 'amber');
  
  if (greenMatches.length === 0 && amberMatches.length === 0) {
    console.log('No matches to send');
    return;
  }
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #2563eb; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .tender { background: #f9fafb; border-left: 4px solid #10b981; padding: 15px; margin: 15px 0; border-radius: 4px; }
        .tender.amber { border-left-color: #f59e0b; }
        .tender-title { font-size: 18px; font-weight: bold; margin-bottom: 8px; }
        .tender-meta { font-size: 14px; color: #6b7280; margin-bottom: 8px; }
        .status { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; }
        .status.green { background: #d1fae5; color: #065f46; }
        .status.amber { background: #fef3c7; color: #92400e; }
        .btn { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 10px; }
        .passes { color: #059669; margin: 8px 0; }
        .issues { color: #dc2626; margin: 8px 0; }
        ul { margin: 5px 0; padding-left: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎯 New Tender Matches</h1>
          <p>${greenMatches.length} strong matches, ${amberMatches.length} possible matches</p>
        </div>
        
        ${greenMatches.length > 0 ? `
          <h2 style="color: #059669; margin-top: 30px;">✅ Strong Matches (Green)</h2>
          ${greenMatches.map(m => `
            <div class="tender">
              <div class="tender-title">${m.tender.title}</div>
              <div class="tender-meta">
                ${m.tender.buyer} • ${m.tender.value ? '£' + m.tender.value.toLocaleString() : 'Value TBC'}
                ${m.tender.deadline ? ' • Deadline: ' + new Date(m.tender.deadline).toLocaleDateString('en-GB') : ''}
              </div>
              <span class="status green">STRONG MATCH</span>
              
              ${m.passes.length > 0 ? `
                <div class="passes">
                  <strong>✓ You meet:</strong>
                  <ul>${m.passes.map(p => `<li>${p}</li>`).join('')}</ul>
                </div>
              ` : ''}
              
              <a href="${m.tender.url}" class="btn">View Tender on Contracts Finder</a>
            </div>
          `).join('')}
        ` : ''}
        
        ${amberMatches.length > 0 ? `
          <h2 style="color: #f59e0b; margin-top: 30px;">⚠️ Possible Matches (Amber)</h2>
          <p style="color: #6b7280; font-size: 14px;">These tenders might be worth checking, but have some potential issues:</p>
          ${amberMatches.map(m => `
            <div class="tender amber">
              <div class="tender-title">${m.tender.title}</div>
              <div class="tender-meta">
                ${m.tender.buyer} • ${m.tender.value ? '£' + m.tender.value.toLocaleString() : 'Value TBC'}
                ${m.tender.deadline ? ' • Deadline: ' + new Date(m.tender.deadline).toLocaleDateString('en-GB') : ''}
              </div>
              <span class="status amber">CHECK CAREFULLY</span>
              
              ${m.passes.length > 0 ? `
                <div class="passes">
                  <strong>✓ You meet:</strong>
                  <ul>${m.passes.map(p => `<li>${p}</li>`).join('')}</ul>
                </div>
              ` : ''}
              
              ${m.issues.length > 0 ? `
                <div class="issues">
                  <strong>⚠ Potential issues:</strong>
                  <ul>${m.issues.map(i => `<li>${i}</li>`).join('')}</ul>
                </div>
              ` : ''}
              
              <a href="${m.tender.url}" class="btn">View Tender on Contracts Finder</a>
            </div>
          `).join('')}
        ` : ''}
        
        <div style="margin-top: 30px; padding: 20px; background: #f9fafb; border-radius: 8px; text-align: center;">
          <p style="color: #6b7280; font-size: 14px; margin: 0;">
            We check Contracts Finder daily for West Midlands adaptation tenders.<br>
            Want to adjust your profile or search area? Update your preferences online.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Tender Alerts <onboarding@resend.dev>',
        to: user.email,
        subject: `🎯 ${greenMatches.length + amberMatches.length} New Tender Matches - ${new Date().toLocaleDateString('en-GB')}`,
        html: html
      })
    });
    
    if (response.ok) {
      console.log(`Email sent to ${user.email}`);
    } else {
      console.error('Failed to send email:', await response.text());
    }
  } catch (error) {
    console.error('Email error:', error);
  }
}

// ==========================================
// 4. MAIN CRON JOB FUNCTION
// ==========================================

export async function runDailyTenderCheck() {
  console.log('Starting daily tender check:', new Date().toISOString());
  
  // 1. Fetch active users from Supabase
  const users = await supabaseQuery('users?subscription_active=eq.true&select=*');
  
  console.log(`Found ${users.length} active users`);
  
  if (users.length === 0) {
    console.log('No active users to check');
    return;
  }
  
  // 2. Fetch new tenders
  const tenders = await fetchAdaptationTenders();
  
  if (tenders.length === 0) {
    console.log('No new tenders found');
    return;
  }
  
  // 3. For each user, qualify tenders and send alerts
  for (const user of users) {
    const qualifications = await Promise.all(
      tenders.map(tender => qualifyTender(tender, user.profile))
    );
    
    // Sort by score (best matches first)
    qualifications.sort((a, b) => b.score - a.score);
    
    // Only send green and amber matches
    const matches = qualifications.filter(q => 
      q.status === 'green' || q.status === 'amber'
    );
    
    if (matches.length > 0) {
      await sendEmailAlert(user, matches);
    }
  }
  
  console.log('Daily tender check complete');
}
