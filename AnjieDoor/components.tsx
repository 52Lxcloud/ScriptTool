import {
    Script,
    Text,
    Button,
    Section,
    HStack,
    VStack,
    Image,
    Spacer,
} from 'scripting'
import { Unit, Lock } from './shared'

export function CloseButton() {
    return (
        <Button action={() => Script.exit()} buttonStyle="plain">
            <Image systemName="xmark.circle.fill" foregroundStyle="secondaryLabel" />
        </Button>
    )
}

export function ResultMessage({
    message,
    type,
}: {
    message: string
    type: 'success' | 'error' | null
}) {
    if (!message) return null

    return (
        <Section>
            <Text
                font="headline"
                foregroundStyle={type === 'success' ? 'systemGreen' : 'systemRed'}
                multilineTextAlignment="center"
            >
                {message}
            </Text>
        </Section>
    )
}

export function UnitListItem({
    unit,
    selected,
    onPress,
}: {
    unit: Unit
    selected: boolean
    onPress: () => void
}) {
    return (
        <HStack contentShape="rect" onTapGesture={onPress}>
            <Image
                systemName={selected ? 'building.2.fill' : 'building.2'}
                foregroundStyle={selected ? 'systemGreen' : 'secondaryLabel'}
            />
            <Text fontWeight={selected ? 'semibold' : 'regular'}>
                {unit.COMMUNITYNAME} {unit.UNITNO || ''}
            </Text>
            <Spacer />
            {selected && <Image systemName="checkmark" foregroundStyle="systemGreen" />}
        </HStack>
    )
}

export function LockListItem({
    lock,
    opening,
    onPress,
}: {
    lock: Lock
    opening: boolean
    onPress: () => void
}) {
    return (
        <HStack spacing={12} contentShape="rect" onTapGesture={onPress}>
            <Image
                systemName={opening ? 'door.left.hand.open' : 'door.left.hand.closed'}
                foregroundStyle={opening ? 'systemOrange' : 'systemGreen'}
                font="title3"
                symbolEffect={
                    opening
                        ? {
                              effect: 'pulse',
                              value: lock.LOCKMAC,
                          }
                        : undefined
                }
            />
            <VStack alignment="leading" spacing={2}>
                <Text font="body" fontWeight="medium" foregroundStyle="label">
                    {lock.LOCKNAME}
                </Text>
                <Text font="caption" foregroundStyle="tertiaryLabel">
                    {lock.LOCKMAC}
                </Text>
            </VStack>
            <Spacer />
            <Image systemName="chevron.right" foregroundStyle="tertiaryLabel" />
        </HStack>
    )
}