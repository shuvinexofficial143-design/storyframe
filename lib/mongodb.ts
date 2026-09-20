import {Db,GridFSBucket,MongoClient,ObjectId} from "mongodb";

const uri=()=>process.env.MONGODB_URI?.trim()||"";
const dbName=()=>process.env.MONGODB_DATABASE?.trim()||"storyframe";

declare global {
  // eslint-disable-next-line no-var
  var __storyframeMongoClientPromise:Promise<MongoClient>|undefined;
}

export function mongoConfigured(){return Boolean(uri())}

export async function mongoClient(){
  const value=uri();
  if(!value)throw new Error("MongoDB media storage is not configured. Add MONGODB_URI in Vercel Environment Variables.");
  if(!global.__storyframeMongoClientPromise){
    const client=new MongoClient(value,{maxPoolSize:8,minPoolSize:0,retryReads:true,retryWrites:true});
    global.__storyframeMongoClientPromise=client.connect();
  }
  return global.__storyframeMongoClientPromise;
}

export async function mongoDb():Promise<Db>{
  return (await mongoClient()).db(dbName());
}

export async function mediaBucket(){
  return new GridFSBucket(await mongoDb(),{bucketName:"media"});
}

export function objectId(value:string){
  if(!ObjectId.isValid(value))throw new Error("Invalid media id.");
  return new ObjectId(value);
}
