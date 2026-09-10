module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Method not allowed'});
  const tenant=process.env.MS_TENANT_ID,client=process.env.MS_CLIENT_ID,secret=process.env.MS_CLIENT_SECRET,sender=process.env.MS_SENDER_EMAIL||'info@ralabaster.com';
  if(!tenant||!client||!secret)return res.status(503).json({ok:false,code:'OFFICE365_NOT_CONFIGURED',error:'Office 365 is not configured on the server.'});
  try{
    const {to,subject,text,quotationNo}=req.body||{};
    if(!to||!subject||!text)return res.status(400).json({ok:false,error:'Missing recipient, subject or message.'});
    const tokenRes=await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:client,client_secret:secret,scope:'https://graph.microsoft.com/.default',grant_type:'client_credentials'})});
    const tokenData=await tokenRes.json();
    if(!tokenRes.ok||!tokenData.access_token)throw new Error(tokenData.error_description||'Could not obtain Microsoft access token.');
    const mail={message:{subject,body:{contentType:'Text',content:text},toRecipients:[{emailAddress:{address:to}}]},saveToSentItems:true};
    const send=await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,{method:'POST',headers:{authorization:`Bearer ${tokenData.access_token}`,'content-type':'application/json'},body:JSON.stringify(mail)});
    if(!send.ok){let detail='';try{detail=JSON.stringify(await send.json())}catch(_){detail=await send.text()}throw new Error(detail||`Microsoft Graph returned ${send.status}`)}
    return res.status(200).json({ok:true,sender,to,quotationNo:quotationNo||''});
  }catch(e){console.error(e);return res.status(500).json({ok:false,error:e?.message||String(e)})}
};