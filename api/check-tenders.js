export default async function handler(req, res) {
  const { email } = req.query;
  
  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }
  
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY;
  
  try {
    // Get user from database
    const userResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}&select=*`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      }
    );
    
    const users = await userResponse.json();
    
    if (!users || users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = users[0];
    
    // Import the tender checking functions
    const { fetchAdaptationTenders, qualifyTender } = await import('../lib/contracts-finder.js');
    
    // Fetch current tenders
    const tenders = await fetchAdaptationTenders();
    
    // Qualify each tender against user's profile
    const qualifications = await Promise.all(
      tenders.map(tender => qualifyTender(tender, user.profile))
    );
    
    // Sort by score
    qualifications.sort((a, b) => b.score - a.score);
    // Return top 5 matches regardless of status
const topMatches = qualifications.slice(0, 5);

res.status(200).json({ matches: topMatches });
    
  } catch (error) {
    console.error('Check tenders error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}
