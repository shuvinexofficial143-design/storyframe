import {NextResponse} from "next/server";

export async function POST(){
  return NextResponse.json(
    {error:"Background build mode was removed. Reload this page once to load the restored direct Manga Studio analyzer."},
    {status:410}
  );
}
