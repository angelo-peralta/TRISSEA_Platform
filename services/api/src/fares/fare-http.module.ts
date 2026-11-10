import {Body,Controller,Get,Headers,HttpCode,Module,Param,Post,Query,Req} from '@nestjs/common';
import {sql} from 'drizzle-orm';
import {AdminRuntime} from '../auth/admin/admin-runtime';
import {AuthorizationService} from '../auth/policy/authorization.service';
import {AuthorizationResources,PostgresAuthorizationDatabase,type PolicyTransaction} from '../auth/policy/authorization-database';
import type {ResourceKind,ResourceRecord} from '../auth/policy/authorization-model';
import {AuthorizationInterceptor,ProtectedPolicy,authorizedRequestContext} from '../auth/policy/authorization.interceptor';
import {FareService} from './fare-service';

export class FareResources extends AuthorizationResources {
  async load(tx:PolicyTransaction,kind:ResourceKind,id:string):Promise<ResourceRecord|null>{
    if(kind!=='CITY_CONFIG')return super.load(tx,kind,id);
    const [city]=await tx.execute(sql`SELECT id FROM identity.city_tenants WHERE id=${id}::uuid`);
    return city?{id,kind,version:1,cityTenantId:id,todaId:null,ownerUserId:null,makerUserId:null,assignedUserId:null}:null;
  }
}
interface Request {headers:Record<string,string|undefined>}
@Controller('admin/fares/cities/:cityId')
export class FareController {
  constructor(readonly service:FareService,readonly admin:AdminRuntime){}
  private async write(request:Request){const c=authorizedRequestContext(request);await this.admin.sessions.assertCsrf(c.tx,c.sessionId,request.headers.origin,request.headers['x-csrf-token']);return c;}
  @Get('editor/policies') @ProtectedPolicy('FARE_CITY_EDIT','cityId')
  list(@Req()r:object,@Query()q:unknown){return this.service.list(authorizedRequestContext(r),q);}
  @Get('reviewer/policies') @ProtectedPolicy('FARE_CITY_REVIEW','cityId')
  reviewList(@Req()r:object,@Query()q:unknown){return this.service.list(authorizedRequestContext(r),q);}
  @Get('editor/policies/:familyId') @ProtectedPolicy('FARE_CITY_EDIT','cityId')
  detail(@Req()r:object,@Param('familyId')id:string,@Query()q:unknown){return this.service.detail(authorizedRequestContext(r),id,q);}
  @Get('reviewer/policies/:familyId') @ProtectedPolicy('FARE_CITY_REVIEW','cityId')
  reviewDetail(@Req()r:object,@Param('familyId')id:string,@Query()q:unknown){return this.service.detail(authorizedRequestContext(r),id,q);}
  @Post('imports') @HttpCode(200) @ProtectedPolicy('FARE_CITY_EDIT','cityId')
  async import(@Req()r:Request,@Body()b:unknown,@Headers('idempotency-key')key:unknown){return this.service.import(await this.write(r),b,key);}
  @Post('policies') @HttpCode(200) @ProtectedPolicy('FARE_CITY_EDIT','cityId')
  async save(@Req()r:Request,@Body()b:unknown,@Headers('idempotency-key')key:unknown){return this.service.save(await this.write(r),b,key);}
  @Post('versions/:versionId/submit') @HttpCode(200) @ProtectedPolicy('FARE_CITY_EDIT','cityId')
  async submit(@Req()r:Request,@Param('versionId')id:string,@Body()b:unknown,@Headers('idempotency-key')key:unknown){return this.service.submit(await this.write(r),id,b,key);}
  @Post('versions/:versionId/reviews') @HttpCode(200) @ProtectedPolicy('FARE_CITY_REVIEW','cityId')
  async review(@Req()r:Request,@Param('versionId')id:string,@Body()b:unknown,@Headers('idempotency-key')key:unknown){return this.service.review(await this.write(r),id,b,key);}
  @Post('editor/simulations') @HttpCode(200) @ProtectedPolicy('FARE_CITY_EDIT','cityId')
  async simulate(@Req()r:Request,@Body()b:unknown,@Headers('idempotency-key')key:unknown){return this.service.simulate(await this.write(r),b,key);}
  @Post('reviewer/simulations') @HttpCode(200) @ProtectedPolicy('FARE_CITY_REVIEW','cityId')
  async reviewSimulate(@Req()r:Request,@Body()b:unknown,@Headers('idempotency-key')key:unknown){return this.service.simulate(await this.write(r),b,key);}
  @Get('editor/snapshots/:snapshotId') @ProtectedPolicy('FARE_CITY_EDIT','cityId')
  snapshot(@Req()r:object,@Param('snapshotId')id:string){return this.service.snapshot(authorizedRequestContext(r),id);}
  @Get('reviewer/snapshots/:snapshotId') @ProtectedPolicy('FARE_CITY_REVIEW','cityId')
  reviewSnapshot(@Req()r:object,@Param('snapshotId')id:string){return this.service.snapshot(authorizedRequestContext(r),id);}
  @Post('editor/calibration') @HttpCode(200) @ProtectedPolicy('FARE_CITY_EDIT','cityId')
  async calibration(@Req()r:Request,@Body()b:unknown){return this.service.calibration(await this.write(r),b);}
  @Post('reviewer/calibration') @HttpCode(200) @ProtectedPolicy('FARE_CITY_REVIEW','cityId')
  async reviewCalibration(@Req()r:Request,@Body()b:unknown){return this.service.calibration(await this.write(r),b);}
}
@Module({controllers:[FareController],providers:[AuthorizationInterceptor,
  {provide:FareService,useFactory:(a:AdminRuntime)=>new FareService(a.secrets),inject:[AdminRuntime]},
  {provide:AuthorizationService,useFactory:(a:AdminRuntime)=>new AuthorizationService(new PostgresAuthorizationDatabase(a.connection),a.proofVerifier,new FareResources()),inject:[AdminRuntime]},
]})
export class FareHttpModule {}
