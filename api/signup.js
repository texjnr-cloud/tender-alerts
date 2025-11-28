export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { email, profile } = req.body;
  
  if (!profile) {
    return res.status(400).json({ error: 'Missing profile' });
  }
  
  // Just return success - don't save to database
  res.status(200).json({ 
    success: true, 
    message: 'Profile received' 
  });
}
