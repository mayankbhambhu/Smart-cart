import { ADDRESS_LABELS, type Address, type AddressLabel } from '@smartcart/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ApiError, customerApi, errorMessage } from '@/lib/api';
import { useCurrentStore } from '@/lib/hooks';
import { toast } from '@/lib/toast';
import { colors, radius, space } from './theme';
import { Button, Chip, Field, Row } from './ui';

const LABELS: Record<AddressLabel, string> = { HOME: '🏠 Home', WORK: '💼 Work', OTHER: '📍 Other' };

/** New delivery address; the pin comes from the phone's location when allowed. */
export function AddressForm({ onSaved }: { onSaved: (address: Address) => void }) {
  const queryClient = useQueryClient();
  const { store } = useCurrentStore();
  const [label, setLabel] = useState<AddressLabel>('HOME');
  const [form, setForm] = useState({
    line1: '',
    line2: '',
    landmark: '',
    city: store?.city ?? '',
    state: store?.state ?? '',
    pincode: store?.pincode ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: async () => {
      // Without location access, pin the address near the store; the rider calls if it is off.
      let position = { lat: (store?.lat ?? 12.97) + 0.004, lng: (store?.lng ?? 77.64) + 0.003 };
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.granted) {
        const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
        if (current) position = { lat: current.coords.latitude, lng: current.coords.longitude };
      }
      return customerApi.post<Address>('/me/addresses', {
        label,
        ...form,
        line2: form.line2 || null,
        landmark: form.landmark || null,
        ...position,
      });
    },
    onSuccess: (address) => {
      void queryClient.invalidateQueries({ queryKey: ['addresses'] });
      onSaved(address);
    },
    onError: (error) => {
      if (error instanceof ApiError) setErrors(error.fieldErrors);
      toast.error('Could not save the address', errorMessage(error));
    },
  });
  const set = (key: keyof typeof form) => (value: string) => setForm({ ...form, [key]: value });
  return (
    <View style={styles.form}>
      <Row style={{ marginBottom: space.md }}>
        {ADDRESS_LABELS.map((l) => (
          <Chip key={l} label={LABELS[l]} active={label === l} onPress={() => setLabel(l)} />
        ))}
      </Row>
      <Field
        label="Flat / house and building"
        value={form.line1}
        onChangeText={set('line1')}
        error={errors.line1}
        textContentType="streetAddressLine1"
      />
      <Field label="Street and area" value={form.line2} onChangeText={set('line2')} textContentType="streetAddressLine2" />
      <Field label="Landmark (optional)" value={form.landmark} onChangeText={set('landmark')} />
      <Row>
        <View style={{ flex: 1 }}>
          <Field label="City" value={form.city} onChangeText={set('city')} error={errors.city} textContentType="addressCity" />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label="PIN code"
            value={form.pincode}
            onChangeText={set('pincode')}
            keyboardType="number-pad"
            maxLength={6}
            error={errors.pincode}
            textContentType="postalCode"
          />
        </View>
      </Row>
      <Field label="State" value={form.state} onChangeText={set('state')} error={errors.state} textContentType="addressState" />
      <Button title="Save address" onPress={() => save.mutate()} loading={save.isPending} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { padding: space.md, backgroundColor: '#fff', borderRadius: radius.md, borderWidth: 1, borderColor: colors.line },
});
