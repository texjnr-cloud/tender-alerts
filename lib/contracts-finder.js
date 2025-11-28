// Contracts Finder API Integration

// ==========================================
// 1. FETCH TENDERS FROM CONTRACTS FINDER API
// ==========================================

export async function fetchAdaptationTenders() {
  const baseUrl = 'https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search';
  
  const keywords = [
    'disabled adaptations',
    'disability adaptations',
    'wet room adaptations',
    'DFG',
    'disabled facilities grant',
    'accessible bathroom',
    'mobility adaptations',
    'level access shower',
    'wheelchair access adaptations',
    'home adaptations disabled'
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
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 30); // Last 30 days for more results
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
