export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { profile } = req.body;
  
  if (!profile) {
    return res.status(400).json({ error: 'Profile required' });
  }
  
  try {
    // Import the tender checking functions
    const { fetchAdaptationTenders, qualifyTender } = await import('../lib/contracts-finder.js');
    
    // Fetch current tenders
    const tenders = await fetchAdaptationTenders();
    
    // Qualify each tender against user's profile
    const qualifications = await Promise.all(
      tenders.map(tender => qualifyTender(tender, profile))
    );
    
    // Sort by score
    qualifications.sort((a, b) => b.score - a.score);
    
    // Return top 5 matches regardless of status
    const topMatches = qualifications.slice(0, 5);
    
    res.status(200).json({ matches: topMatches });
    
  } catch (error) {
    console.error('Check tenders error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
}
