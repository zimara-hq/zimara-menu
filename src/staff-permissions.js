import {bad,forbidden,notFound,now} from './util.js';

export const STAFF_CAPABILITIES=Object.freeze({
 tickets_view:['عرض النداءات','View pagers'],tickets_create:['إنشاء نداء','Create pagers'],tickets_call:['إعلان الجاهزية','Mark ready'],tickets_realert:['إعادة النداء','Repeat alerts'],tickets_collect:['تأكيد الاستلام','Confirm collection'],tickets_cancel:['إلغاء النداء','Cancel pagers'],
 loyalty_view:['البحث عن بطاقة الولاء','Find loyalty cards'],loyalty_stamp:['إضافة أختام','Add stamps'],loyalty_redeem:['استبدال مكافآت','Redeem rewards'],
 orders_view:['عرض طلبات المنيو','View menu orders'],orders_accept:['قبول طلبات المنيو','Accept orders'],orders_reject:['رفض طلبات المنيو','Reject orders'],availability:['تعديل توفر الأصناف','Change availability'],waitlist:['إدارة قائمة الانتظار','Manage waitlist'],display:['إدارة شاشات العرض','Manage displays'],
});
export async function staffPermissions(env,branchId){
 const row=await env.DB.prepare('SELECT permissions_json FROM branch_permissions WHERE branch_id=?').bind(branchId).first();
 return{...Object.fromEntries(Object.keys(STAFF_CAPABILITIES).map(key=>[key,true])),...JSON.parse(row?.permissions_json||'{}')};
}
export function capabilityFor(path,method){
 const suffix=path.replace(/^\/api\/branch\//,'');
 if(/^tickets(?:\/|$)/.test(suffix)){
  if(method==='GET')return'tickets_view';if(suffix==='tickets')return'tickets_create';
  return{ready:'tickets_call',realert:'tickets_realert',collect:'tickets_collect',cancel:'tickets_cancel'}[suffix.split('/').at(-1)]||'tickets_view';
 }
 if(/^loyalty\//.test(suffix))return method==='GET'?'loyalty_view':suffix.endsWith('/stamp')?'loyalty_stamp':'loyalty_redeem';
 if(/^orders(?:\/|$)/.test(suffix))return method==='GET'?'orders_view':suffix.endsWith('/accept')?'orders_accept':'orders_reject';
 if(/^display-devices/.test(suffix))return'display';
 if(/^waitlist/.test(suffix))return'waitlist';
 if(/^menu$|^availability\//.test(suffix))return'availability';
 return null;
}
export async function enforceStaff(c,user){
 if(user.role!=='branch'||!c.req.path.startsWith('/api/branch/'))return;
 const permission=capabilityFor(c.req.path,c.req.method);
 if(permission&&!(await staffPermissions(c.env,user.branch_id))[permission])throw forbidden('staff_permission_denied');
}
export function registerStaffPermissions(app,{requireRole,body,audit}){
 const owner=requireRole('owner');
 const owned=async c=>{const branch=await c.env.DB.prepare('SELECT id FROM branches WHERE id=? AND org_id=?').bind(c.req.param('id'),c.get('user').org_id).first();if(!branch)throw notFound();return branch.id;};
 app.get('/api/owner/branches/:id/permissions',owner,async c=>c.json({permissions:await staffPermissions(c.env,await owned(c)),capabilities:STAFF_CAPABILITIES}));
 app.put('/api/owner/branches/:id/permissions',owner,async c=>{
  const branchId=await owned(c),b=await body(c),permissions=b.permissions;
  if(!permissions||typeof permissions!=='object'||Array.isArray(permissions))throw bad('invalid_permissions');
  for(const key of Object.keys(permissions))if(!Object.hasOwn(STAFF_CAPABILITIES,key)||typeof permissions[key]!=='boolean')throw bad('invalid_permissions');
  if(Object.keys(permissions).length!==Object.keys(STAFF_CAPABILITIES).length)throw bad('permissions_incomplete');
  for(const [view,actions]of [['tickets_view',['tickets_create','tickets_call','tickets_realert','tickets_collect','tickets_cancel']],['loyalty_view',['loyalty_stamp','loyalty_redeem']],['orders_view',['orders_accept','orders_reject']]])if(!permissions[view]&&actions.some(k=>permissions[k]))throw bad('permissions_dependency');
  await c.env.DB.prepare('INSERT INTO branch_permissions(branch_id,permissions_json,updated_at) VALUES(?,?,?) ON CONFLICT(branch_id) DO UPDATE SET permissions_json=excluded.permissions_json,updated_at=excluded.updated_at').bind(branchId,JSON.stringify(permissions),now()).run();
  await audit(c.env,c.get('user'),'staff.permissions',{branch_id:branchId,permissions});
  return c.json({permissions});
 });
}
