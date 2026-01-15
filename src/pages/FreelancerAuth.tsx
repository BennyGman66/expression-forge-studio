import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function FreelancerAuth() {
  const navigate = useNavigate();
  
  useEffect(() => {
    // Redirect to the public freelancer board which handles name-only identity
    navigate('/work', { replace: true });
  }, [navigate]);

  return null;
}
