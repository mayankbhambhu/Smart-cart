import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToasts } from '@/lib/toast';
import { colors, radius, shadow, space } from './theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function Screen({
  children,
  scroll = true,
  padded = true,
  edges = [],
  refreshing,
  onRefresh,
  footer,
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: ('top' | 'bottom')[];
  refreshing?: boolean;
  onRefresh?: () => void;
  footer?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const content = scroll ? (
    <ScrollView
      contentContainerStyle={[padded && styles.padded, { paddingBottom: footer ? 120 : 32 }, style]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? <RefreshControl refreshing={refreshing ?? false} onRefresh={onRefresh} tintColor={colors.brand} /> : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, padded && styles.padded, style]}>{children}</View>
  );
  return (
    <SafeAreaView edges={edges} style={styles.screen}>
      {content}
      {footer && <Footer>{footer}</Footer>}
    </SafeAreaView>
  );
}

function Footer({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>{children}</View>;
}

export function Row({ children, gap = space.sm, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginVertical: space.sm }} />;
}

/** A page sheet (iOS) / full-screen dialog (Android) with a title and close button. */
export function Sheet({
  visible,
  onClose,
  title,
  children,
  scroll = true,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  scroll?: boolean;
}) {
  const body = scroll ? (
    <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: 0, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View style={{ flex: 1, padding: space.lg, paddingTop: 0 }}>{children}</View>
  );
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Row style={{ justifyContent: 'space-between', padding: space.lg }}>
          <Text style={[styles.h1, { flex: 1 }]} numberOfLines={1}>
            {title}
          </Text>
          <IconButton name="close" label="Close" onPress={onClose} />
        </Row>
        {body}
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

type TextProps = { children: ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number };

export const H1 = ({ children, style, numberOfLines }: TextProps) => (
  <Text style={[styles.h1, style]} numberOfLines={numberOfLines}>
    {children}
  </Text>
);
export const H2 = ({ children, style, numberOfLines }: TextProps) => (
  <Text style={[styles.h2, style]} numberOfLines={numberOfLines}>
    {children}
  </Text>
);
export const Body = ({ children, style, numberOfLines }: TextProps) => (
  <Text style={[styles.body, style]} numberOfLines={numberOfLines}>
    {children}
  </Text>
);
export const Muted = ({ children, style, numberOfLines }: TextProps) => (
  <Text style={[styles.muted, style]} numberOfLines={numberOfLines}>
    {children}
  </Text>
);

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: space.lg, marginBottom: space.sm }}>
      <H2>{title}</H2>
      {action}
    </Row>
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'dark' | 'accent';

const buttonColors: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.brand, fg: '#fff' },
  secondary: { bg: '#f1f5f9', fg: colors.text },
  outline: { bg: '#fff', fg: colors.text, border: '#cbd5e1' },
  ghost: { bg: 'transparent', fg: colors.text },
  danger: { bg: colors.danger, fg: '#fff' },
  dark: { bg: colors.ink, fg: '#fff' },
  accent: { bg: colors.accent, fg: colors.ink },
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  loading,
  disabled,
  block,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  block?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = buttonColors[variant];
  const height = size === 'sm' ? 36 : size === 'lg' ? 54 : 46;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { height, backgroundColor: c.bg, borderColor: c.border ?? c.bg, borderWidth: c.border ? 1 : 0 },
        block && { alignSelf: 'stretch' },
        (disabled || loading) && { opacity: 0.5 },
        pressed && { opacity: 0.8 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={c.fg} /> : icon ? <Ionicons name={icon} size={size === 'sm' ? 16 : 18} color={c.fg} /> : null}
      <Text style={[styles.buttonText, { color: c.fg, fontSize: size === 'sm' ? 13 : size === 'lg' ? 16 : 15 }]}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({
  name,
  onPress,
  label,
  color = colors.text,
  size = 22,
}: {
  name: IconName;
  onPress: () => void;
  label: string;
  color?: string;
  size?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => [{ padding: 6 }, pressed && { opacity: 0.6 }]}
    >
      <Ionicons name={name} size={size} color={color} />
    </Pressable>
  );
}

export function Field({ label, error, hint, ...props }: TextInputProps & { label?: string; error?: string; hint?: string }) {
  return (
    <View style={{ marginBottom: space.md }}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        placeholderTextColor={colors.faint}
        {...props}
        style={[styles.input, error ? { borderColor: colors.danger } : null, props.style]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Muted style={{ fontSize: 12, marginTop: 4 }}>{hint}</Muted> : null}
    </View>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && { backgroundColor: colors.brandSoft, borderColor: colors.brand }]}>
      <Text style={[styles.chipText, active && { color: colors.brandDark }]}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => (
        <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.segment, value === o.value && styles.segmentActive]}>
          <Text style={[styles.segmentText, value === o.value && { color: colors.ink }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Stepper({ value, onChange, max = 99 }: { value: number; onChange: (value: number) => void; max?: number }) {
  return (
    <View style={styles.stepper}>
      <Pressable accessibilityLabel="Decrease" hitSlop={6} onPress={() => onChange(value - 1)} style={styles.stepperButton}>
        <Text style={styles.stepperText}>−</Text>
      </Pressable>
      <Text style={[styles.stepperText, { minWidth: 22, textAlign: 'center' }]}>{value}</Text>
      <Pressable
        accessibilityLabel="Increase"
        hitSlop={6}
        onPress={() => value < max && onChange(value + 1)}
        style={[styles.stepperButton, value >= max && { opacity: 0.4 }]}
      >
        <Text style={styles.stepperText}>+</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

type Tone = 'green' | 'gray' | 'red' | 'yellow' | 'blue' | 'violet';
const toneColors: Record<Tone, { bg: string; fg: string }> = {
  green: { bg: colors.brandSoft, fg: colors.brandDark },
  gray: { bg: '#f1f5f9', fg: '#334155' },
  red: { bg: colors.dangerSoft, fg: colors.danger },
  yellow: { bg: colors.warningSoft, fg: colors.warning },
  blue: { bg: colors.infoSoft, fg: colors.info },
  violet: { bg: colors.violetSoft, fg: colors.violet },
};

export function Badge({ label, tone = 'gray' }: { label: string; tone?: Tone }) {
  const c = toneColors[tone];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

export function ProductArt({ emoji, color, size = 48 }: { emoji: string; color: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: size * 0.55 }}>{emoji}</Text>
    </View>
  );
}

export function Loader({ label }: { label?: string }) {
  return (
    <View style={{ padding: 40, alignItems: 'center', gap: 10 }}>
      <ActivityIndicator color={colors.brand} size="large" />
      {label && <Muted>{label}</Muted>}
    </View>
  );
}

export function EmptyState({ emoji, title, body, action }: { emoji: string; title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', padding: 32, gap: 6 }}>
      <Text style={{ fontSize: 40 }}>{emoji}</Text>
      <Text style={[styles.h2, { textAlign: 'center' }]}>{title}</Text>
      {body && <Muted style={{ textAlign: 'center' }}>{body}</Muted>}
      {action && <View style={{ marginTop: 12 }}>{action}</View>}
    </View>
  );
}

export function ToastHost() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  const insets = useSafeAreaInsets();
  if (toasts.length === 0) return null;
  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { paddingTop: insets.top + 8, alignItems: 'center' }]}>
      {toasts.map((t) => (
        <Pressable key={t.id} onPress={() => dismiss(t.id)} style={[styles.toast, shadow]}>
          <Ionicons
            name={t.tone === 'success' ? 'checkmark-circle' : t.tone === 'error' ? 'close-circle' : 'information-circle'}
            size={22}
            color={t.tone === 'success' ? colors.brand : t.tone === 'error' ? colors.danger : colors.info}
          />
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: colors.ink }}>{t.title}</Text>
            {t.body && <Muted>{t.body}</Muted>}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  padded: { padding: space.lg },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.lg,
    ...shadow,
  },
  h1: { fontSize: 24, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  h2: { fontSize: 17, fontWeight: '700', color: colors.ink },
  body: { fontSize: 15, color: colors.text },
  muted: { fontSize: 13, color: colors.muted },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
  },
  buttonText: { fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 6 },
  input: {
    height: 46,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: '#fff',
  },
  error: { color: colors.danger, fontSize: 12, marginTop: 4 },
  chip: {
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#fff',
    justifyContent: 'center',
  },
  chipText: { fontSize: 13, fontWeight: '600', color: '#334155' },
  segmented: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: radius.md, padding: 3 },
  segment: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  segmentActive: { backgroundColor: '#fff', ...shadow },
  segmentText: { fontSize: 13, fontWeight: '700', color: colors.muted },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.brand, borderRadius: 10, height: 34 },
  stepperButton: { paddingHorizontal: 10, height: '100%', justifyContent: 'center' },
  stepperText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  toast: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    width: '92%',
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    padding: space.md,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.line,
  },
});
