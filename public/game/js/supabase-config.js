// Supabase 접속 정보. anon(publishable) key는 브라우저에 공개되는 것이 정상이며, 실제 보호는 RLS가 한다.
// service_role key는 절대 여기에 넣지 않는다.
window.SUPABASE_CONFIG = {
  url: 'https://cgkocnezpitydxrflxom.supabase.co',
  anonKey: 'sb_publishable_AeFebsXzuE9Skf_6NJMrsQ_IWj7s3-b',
};
