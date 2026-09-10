// rAlabaster Productieplanner - centrale instellingen
// Kleine wijzigingen zoals medewerkers, werktijden en standaard doorlooptijden kunnen hier.
window.RALAB_CONFIG = {
  appVersion: 11,
  employees: ['Ralph','Peter','Kaan','Lance','Shaffi'],
  schedule: {
    monThu: { start: '08:15', end: '16:30' },
    friday: { Ralph: { start: '08:15', end: '15:00' } },
    saturdayOvertime: { start: '08:00', end: '12:00' }
  },
  online: {
    supabaseUrl: 'https://gspqapzowtktdobltkcl.supabase.co',
    supabasePublishableKey: 'sb_publishable_cH7Q_KVdG41QYkp0wvdHVQ_HbaX6VHh',
    workspaceId: 'ralabaster'
  },
  rules: {
    dryRoomMinutes: 540,
    externalLeadDays: 14,
    workdaySplitMinutesMinimum: 15
  }
};
