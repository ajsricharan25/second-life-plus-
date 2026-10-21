import { appliances, estimate } from './estimator.ts'
import type { ApplianceId, AssessmentInput } from './estimator.ts'

export type DeviceId = ApplianceId | 'other'
export interface DeviceInput extends Omit<AssessmentInput, 'appliance'> {
  appliance: DeviceId
  deviceName?: string
}

export const deviceOptions = [
  ...appliances,
  {
    id: 'other' as const,
    name: 'Other devices',
    shortName: 'Other devices',
    defaultAge: 1,
    symptomSuggestions: ['Not turning on', 'Stops during use', 'Unusual noise'],
  },
]

export function customDeviceName(value: unknown): string {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error('Enter the device type or name, such as an air purifier or printer.')
  }
  const name = value.normalize('NFKC').trim().replace(/\s+/gu, ' ')
  if (name.length < 2 || name.length > 80) {
    throw new Error('Describe the device type or name in 2–80 characters.')
  }
  return name
}

export function getDeviceName(input: Pick<DeviceInput, 'appliance' | 'deviceName'>): string {
  if (input.appliance === 'other') return customDeviceName(input.deviceName)
  const name = appliances.find((item) => item.id === input.appliance)?.name
  if (!name) throw new Error('Choose a supported device or Other devices.')
  return name
}

export function validateDeviceInput(value: unknown): DeviceInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Provide the device details and symptoms.')
  }
  const data = value as Record<string, unknown>
  if (!deviceOptions.some((device) => device.id === data.appliance)) {
    throw new Error('Choose a supported device or Other devices.')
  }
  const appliance = data.appliance as DeviceId
  const deviceName = appliance === 'other' ? customDeviceName(data.deviceName) : undefined
  if (
    typeof data.age !== 'number' ||
    !Number.isFinite(data.age) ||
    data.age < 0 ||
    data.age > 100
  ) {
    throw new Error('Enter a device age between 0 and 100 years.')
  }
  if (data.currency !== 'INR' && data.currency !== 'USD') throw new Error('Choose INR or USD.')
  if (typeof data.symptoms !== 'string' || !data.symptoms.trim() || data.symptoms.length > 2000) {
    throw new Error('Describe the condition and symptoms in 2,000 characters or fewer.')
  }
  const budget = data.replacementCost
  if (
    budget !== undefined &&
    (typeof budget !== 'number' || !Number.isFinite(budget) || budget <= 0 || budget > 100_000_000)
  ) {
    throw new Error('Enter a replacement cost greater than zero and no more than 100,000,000.')
  }
  return {
    appliance,
    ...(deviceName ? { deviceName } : {}),
    age: data.age,
    currency: data.currency,
    symptoms: data.symptoms.trim(),
    ...(budget !== undefined ? { replacementCost: budget as number } : {}),
  }
}

export function getOfflineAssessment(input: DeviceInput) {
  // Other devices have no category cost, lifespan or material-weight assumptions.
  return input.appliance === 'other' ? null : estimate(input)
}
