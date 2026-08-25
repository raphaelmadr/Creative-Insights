import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { level, source, message, stack, url } = body;

    if (!level || !source || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    await prisma.systemLog.create({
      data: {
        level,
        source,
        message,
        stack,
        url,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to log error via API:', error);
    return NextResponse.json({ error: 'Failed to log error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const logs = await prisma.systemLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100, // Limita aos últimos 100 logs
    });

    return NextResponse.json(logs);
  } catch (error) {
    console.error('Failed to fetch logs:', error);
    return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await prisma.systemLog.deleteMany({});
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to clear logs:', error);
    return NextResponse.json({ error: 'Failed to clear logs' }, { status: 500 });
  }
}
