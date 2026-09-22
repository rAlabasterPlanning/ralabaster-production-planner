const RESOURCE='https://ralabasterplanner.vercel.app/api/mcp';
const AUTHORIZATION_SERVER='https://gspqapzowtktdobltkcl.supabase.co/auth/v1';

export default function handler(request,response){
  if(request.method!=='GET')return response.status(405).json({error:'method_not_allowed'});
  response.setHeader('Cache-Control','public, max-age=300');
  return response.status(200).json({
    resource:RESOURCE,
    authorization_servers:[AUTHORIZATION_SERVER],
    bearer_methods_supported:['header'],
    scopes_supported:['email'],
    resource_name:'rAlabaster Productieplanner',
  });
}
