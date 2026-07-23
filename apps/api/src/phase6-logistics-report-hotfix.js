function requestError(message,status=400){const error=new Error(message);error.status=status;return error;}

export function installPhase6LogisticsReportHotfix({app,pool,authRequired,accessibleCompanyIds}){
  app.get('/api/operations/logistics/reports/:code',authRequired,async(req,res,next)=>{
    try{
      if(!['fleet-overview','document-expiry'].includes(req.params.code))return next();
      const companyIds=await accessibleCompanyIds(req.user);
      if(!companyIds.length)return res.json([]);
      let sql;
      if(req.params.code==='fleet-overview'){
        sql=`SELECT v.id,v.code,v.plate_no,v.vehicle_type,v.make,v.model,v.capacity_kg,v.odometer_km,
          v.fuel_norm_l_100km,v.registration_expiry,v.insurance_expiry,v.technical_inspection_expiry,v.active
          FROM logistics_vehicles v
          WHERE v.tenant_id=$1 AND v.company_id=ANY($2::uuid[])
          ORDER BY v.plate_no`;
      }else if(req.params.code==='document-expiry'){
        sql=`SELECT 'VEHICLE' AS entity_type,v.plate_no AS entity,v.registration_expiry,v.insurance_expiry,
          v.technical_inspection_expiry,NULL::date AS license_expiry
          FROM logistics_vehicles v
          WHERE v.tenant_id=$1 AND v.company_id=ANY($2::uuid[])
          UNION ALL
          SELECT 'DRIVER',d.full_name,NULL,NULL,NULL,d.license_expiry
          FROM logistics_drivers d
          WHERE d.tenant_id=$1 AND d.company_id=ANY($2::uuid[])
          ORDER BY entity`;
      }else{
        throw requestError('Raporti i logjistikës nuk njihet.',404);
      }
      const {rows}=await pool.query(sql,[req.user.tenant_id,companyIds]);
      res.json(rows);
    }catch(error){next(error);}
  });
}
