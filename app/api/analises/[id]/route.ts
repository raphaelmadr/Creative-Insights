import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const dataToUpdate: any = {};
    if (body.title !== undefined) {
      dataToUpdate.title = body.title;
    }
    if (body.resolved !== undefined) {
      dataToUpdate.resolved = body.resolved;
    }

    const updated = await prisma.campaignAnalysis.update({
      where: { id },
      data: dataToUpdate,
    });

    revalidatePath("/analises");
    revalidatePath(`/analises/${id}`);

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error("Failed to update analysis:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
