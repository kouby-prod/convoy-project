import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps } from 'react-native';
import { colors, radius, spacing, fontSize } from '@/lib/theme';

export type ButtonVariant = 'primary' | 'outline' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'style'> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        sizeStyles[size],
        variantStyles[variant],
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'outline' ? colors.primary : colors.primaryForeground} />
      ) : (
        <Text style={[styles.label, sizeTextStyles[size], variantTextStyles[variant]]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  label: { fontWeight: '600' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
});

const sizeStyles = StyleSheet.create({
  sm: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md },
  md: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  lg: { paddingVertical: spacing.md, paddingHorizontal: spacing.xl },
});

const sizeTextStyles = StyleSheet.create({
  sm: { fontSize: fontSize.xs },
  md: { fontSize: fontSize.sm },
  lg: { fontSize: fontSize.md },
});

const variantStyles = StyleSheet.create({
  primary: { backgroundColor: colors.primary },
  outline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  destructive: { backgroundColor: colors.destructive },
});

const variantTextStyles = StyleSheet.create({
  primary: { color: colors.primaryForeground },
  outline: { color: colors.primary },
  destructive: { color: colors.destructiveForeground },
});
