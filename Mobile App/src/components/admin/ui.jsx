import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

export function Card({ children, className = '', style }) {
  return <View style={style} className={`rounded-2xl border border-sky-100 bg-white p-4 ${className}`}>{children}</View>;
}

export function SectionTitle({ title, subtitle, right }) {
  return (
    <View className="mb-3 flex-row items-end justify-between">
      <View className="flex-1 pr-3">
        <Text className="text-lg font-extrabold text-[#0b3974]">{title}</Text>
        {subtitle ? <Text className="mt-0.5 text-sm text-slate-500">{subtitle}</Text> : null}
      </View>
      {right ? <View className="shrink-0">{right}</View> : null}
    </View>
  );
}

const BUTTON_STYLES = {
  primary: ['bg-[#1689df]', 'text-white'],
  secondary: ['border border-sky-200 bg-white', 'text-[#07539d]'],
  danger: ['bg-red-600', 'text-white'],
  ghost: ['bg-transparent', 'text-[#1689df]'],
};

export function Button({ label, onPress, variant = 'primary', size = 'md', disabled = false, loading = false, className = '' }) {
  const [box, text] = BUTTON_STYLES[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive }}
      disabled={inactive}
      onPress={onPress}
      className={`flex-row items-center justify-center rounded-xl ${size === 'sm' ? 'min-h-10 px-3' : 'min-h-11 px-4'} ${box} ${inactive ? 'opacity-50' : ''} ${className}`}
    >
      {loading ? <ActivityIndicator color={variant === 'primary' || variant === 'danger' ? 'white' : '#1689df'} className="mr-2" /> : null}
      <Text className={`font-bold ${size === 'sm' ? 'text-sm' : ''} ${text}`}>{label}</Text>
    </Pressable>
  );
}

const TONES = {
  green: 'bg-emerald-50 text-emerald-700',
  red: 'bg-red-50 text-red-700',
  amber: 'bg-amber-50 text-amber-700',
  blue: 'bg-sky-50 text-[#07539d]',
  slate: 'bg-slate-100 text-slate-600',
};

export function Badge({ tone = 'slate', children }) {
  const [bg, fg] = TONES[tone].split(' ');
  return (
    <View className={`self-start rounded-full px-2.5 py-1 ${bg}`}>
      <Text className={`text-xs font-bold ${fg}`}>{children}</Text>
    </View>
  );
}

export function StatCard({ label, value, hint, icon, compact = false, width = '48.5%' }) {
  // compact = phone layout: 2 cards per row, tighter padding, smaller number
  return (
    <Card style={compact ? { width } : undefined} className={compact ? 'mb-3 p-3.5' : 'min-w-[150px] flex-1'}>
      <View className="mb-2 flex-row items-center justify-between">
        <Text numberOfLines={1} className={`flex-1 pr-2 font-semibold text-slate-500 ${compact ? 'text-xs' : 'text-sm'}`}>{label}</Text>
        <Text className="text-base text-[#1689df]">{icon}</Text>
      </View>
      <Text className={`font-extrabold text-[#07539d] ${compact ? 'text-2xl' : 'text-3xl'}`}>{value}</Text>
      {hint ? <Text numberOfLines={1} className="mt-1 text-xs text-slate-400">{hint}</Text> : null}
    </Card>
  );
}

export function ErrorBanner({ message, onRetry }) {
  if (!message) return null;
  return (
    <View accessibilityRole="alert" className="mb-3 flex-row items-center rounded-xl bg-red-50 px-3 py-3">
      <Text className="flex-1 text-sm leading-5 text-red-700">{message}</Text>
      {onRetry ? <Pressable onPress={onRetry} className="pl-3"><Text className="font-bold text-red-700">ลองใหม่</Text></Pressable> : null}
    </View>
  );
}

export function Spinner({ label = 'กำลังโหลด...' }) {
  return (
    <View className="items-center justify-center py-10">
      <ActivityIndicator color="#1689df" />
      <Text className="mt-2 text-sm text-slate-500">{label}</Text>
    </View>
  );
}

export function EmptyState({ icon = '◌', title, subtitle }) {
  return (
    <View className="items-center justify-center py-10">
      <Text className="mb-2 text-4xl text-sky-200">{icon}</Text>
      <Text className="font-bold text-[#0b3974]">{title}</Text>
      {subtitle ? <Text className="mt-1 text-center text-sm text-slate-500">{subtitle}</Text> : null}
    </View>
  );
}

export function Chips({ options, value, onChange }) {
  return (
    <View className="flex-row flex-wrap">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            className={`mb-2 mr-2 min-h-10 justify-center rounded-full border px-4 ${selected ? 'border-[#1689df] bg-[#1689df]' : 'border-sky-200 bg-white'}`}
          >
            <Text className={`text-sm font-semibold ${selected ? 'text-white' : 'text-[#07539d]'}`}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function TextField({ label, hint, className = '', ...props }) {
  return (
    <View className={`mb-4 ${className}`}>
      {label ? <Text className="mb-2 text-sm font-semibold text-[#0b3974]">{label}</Text> : null}
      <TextInput
        placeholderTextColor="#8ba2b8"
        autoCapitalize="none"
        autoCorrect={false}
        className="min-h-12 rounded-xl border border-sky-100 bg-[#f8fcff] px-4 text-base text-[#0b3974]"
        {...props}
      />
      {hint ? <Text className="mt-1 text-xs text-slate-400">{hint}</Text> : null}
    </View>
  );
}

export function ProgressBar({ value }) {
  const percent = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: percent }} className="h-3 overflow-hidden rounded-full bg-sky-100">
      <View style={{ width: `${percent}%` }} className="h-full rounded-full bg-[#1689df]" />
    </View>
  );
}

// columns: [{ key, title, width, render? }]
export function DataTable({ columns, rows, keyExtractor }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator>
      <View>
        <View className="flex-row border-b border-sky-100 bg-[#f8fcff]">
          {columns.map((column) => (
            <View key={column.key} style={{ width: column.width || 140 }} className="px-3 py-2">
              <Text className="text-xs font-bold uppercase text-slate-500">{column.title}</Text>
            </View>
          ))}
        </View>
        {rows.map((row, index) => (
          <View key={keyExtractor ? keyExtractor(row, index) : index} className="flex-row items-center border-b border-slate-50">
            {columns.map((column) => (
              <View key={column.key} style={{ width: column.width || 140 }} className="px-3 py-2.5">
                {column.render ? column.render(row) : <Text numberOfLines={1} className="text-sm text-[#0b3974]">{String(row[column.key] ?? '—')}</Text>}
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

export const formatNumber = (value) => Number(value || 0).toLocaleString('en-US');