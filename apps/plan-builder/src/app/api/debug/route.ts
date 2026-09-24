import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const filePath = path.join(process.cwd(), 'debug_api_response.json');
    fs.writeFileSync(filePath, JSON.stringify(body, null, 2));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API DEBUG ERROR:", error);
    return NextResponse.json({ success: false });
  }
}
