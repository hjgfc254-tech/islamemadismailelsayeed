/** Canonical route registry. These are client-side route identifiers, not authorization rules. */
'use strict';
const ROUTES=Object.freeze({
 customer:Object.freeze({home:'home',discover:'discover',search:'search',requestCreate:'request-create',orders:'orders',orderDetails:'order-details',account:'account',addresses:'addresses',support:'support'}),
 provider:Object.freeze({dashboard:'dashboard',incomingRequests:'incoming-requests',requestDetails:'request-details',quotes:'quotes',activeJobs:'active-jobs',schedule:'schedule',services:'services',earnings:'earnings',transactions:'transactions',reviews:'reviews',notifications:'notifications',profile:'profile'}),
 admin:Object.freeze({dashboard:'dashboard',orders:'orders',providers:'providers',customers:'customers',services:'services',categories:'categories',quotes:'quotes',commissions:'commissions',finance:'finance',settlements:'settlements',complaints:'complaints',reviews:'reviews',notifications:'notifications',reports:'reports',workforce:'workforce',departments:'departments',roles:'roles',permissions:'permissions',security:'security',auditLog:'audit-log',settings:'settings'})
});
const hasRoute=(app,id)=>!!(ROUTES[app]&&Object.values(ROUTES[app]).includes(id));
const routeId=(app,key)=>ROUTES[app]&&ROUTES[app][key]||null;
const api={ROUTES,hasRoute,routeId};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(typeof globalThis!=='undefined')globalThis.HSRoutes=api;
