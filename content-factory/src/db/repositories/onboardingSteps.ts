import { prisma } from '../client';
import type { OnboardingStep } from '@prisma/client';

export async function getOnboardingStepsOrdered(): Promise<OnboardingStep[]> {
  return prisma.onboardingStep.findMany({
    orderBy: { stepOrder: 'asc' },
  });
}

export async function getOnboardingStepByOrder(stepOrder: number): Promise<OnboardingStep | null> {
  return prisma.onboardingStep.findFirst({
    where: { stepOrder },
  });
}

export async function updateOnboardingStepFileId(
  stepOrder: number,
  fileId: string
): Promise<OnboardingStep> {
  const step = await getOnboardingStepByOrder(stepOrder);
  if (!step) throw new Error(`OnboardingStep stepOrder=${stepOrder} not found`);
  return prisma.onboardingStep.update({
    where: { id: step.id },
    data: { fileId },
  });
}
