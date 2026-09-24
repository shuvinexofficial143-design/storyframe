import {NextResponse} from "next/server";

export async function GET(){
  return NextResponse.json(
    {status:"cancelled",error:"Background build mode was removed. Reload this page once to use the restored direct Manga Studio analyzer."},
    {status:410}
  );
}
