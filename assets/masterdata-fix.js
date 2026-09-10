// Hotfix: robuuste opslag van klantstamgegevens
(()=>{
  function val(id){return document.getElementById(id)?.value?.trim()||''}
  function saveCustomerFixed(id=''){
    try{
      if(typeof state==='undefined') throw new Error('Plannerdata is nog niet geladen.');
      state.customers=Array.isArray(state.customers)?state.customers:[];
      const name=val('mdCompany');
      if(!name){alert('Bedrijfsnaam is verplicht.');document.getElementById('mdCompany')?.focus();return;}
      const old=id?state.customers.find(x=>x.id===id):null;
      const customer={
        ...(old||{}),
        id:old?.id||('cus_'+Date.now()),
        name,
        contact:val('mdContact'),
        vatNo:val('mdVat'),
        street:val('mdStreet'),
        zip:val('mdZip'),
        city:val('mdCity'),
        country:val('mdCountry'),
        email:val('mdEmail'),
        phone:val('mdPhone'),
        website:val('mdWebsite'),
        paymentTerms:val('mdPayment'),
        currency:val('mdCurrency')||'EUR',
        notes:val('mdNotes'),
        address:[val('mdStreet'),val('mdZip'),val('mdCity')].filter(Boolean).join(', '),
        updated:new Date().toISOString()
      };
      if(old){Object.assign(old,customer)}else{customer.created=new Date().toISOString();state.customers.push(customer)}
      if(typeof save==='function') save();
      else localStorage.setItem('ralabaster_planner_v1',JSON.stringify(state));
      if(typeof closeModal==='function') closeModal();
      if(window.RALAB_MASTER?.renderCustomers) window.RALAB_MASTER.renderCustomers();
      const root=document.getElementById('view-customers');
      if(root){const note=document.createElement('div');note.className='notice';note.style.margin='10px 0';note.textContent='Klant opgeslagen: '+name;root.prepend(note);setTimeout(()=>note.remove(),2500)}
    }catch(err){console.error('Klant opslaan mislukt',err);alert('Opslaan mislukt: '+(err?.message||err));}
  }
  function install(){
    if(!window.RALAB_MASTER)return setTimeout(install,100);
    window.RALAB_MASTER.saveCustomer=saveCustomerFixed;
  }
  install();
})();