import { CameraView, useCameraPermissions, type BarcodeType } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, IconButton } from './ui';
import { colors, radius } from './theme';

const BARCODE_TYPES: BarcodeType[] = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'qr'];

/**
 * Full-screen camera scanner for product barcodes, exit passes, pickup codes
 * and the attendance kiosk. A typed code is always possible as a fallback.
 */
export function ScannerModal({
  visible,
  onClose,
  onScan,
  title = 'Scan a barcode',
  hint = 'Point the camera at the barcode on the pack',
  manualPlaceholder = 'Type the barcode number',
  continuous = false,
  status,
}: {
  visible: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
  title?: string;
  hint?: string;
  manualPlaceholder?: string;
  /** Keep scanning after a read (Scan & Go); otherwise the caller closes the modal. */
  continuous?: boolean;
  /** Shown above the manual entry, e.g. the last item added and the running total. */
  status?: ReactNode;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState('');
  const last = useRef<{ code: string; at: number } | null>(null);

  useEffect(() => {
    if (visible && permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [visible, permission, requestPermission]);
  useEffect(() => {
    if (visible) last.current = null;
  }, [visible]);

  const handle = (code: string) => {
    const now = Date.now();
    // The camera reports the same code many times per second: debounce repeats.
    if (last.current && last.current.code === code && now - last.current.at < (continuous ? 2500 : 100000)) return;
    last.current = { code, at: now };
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onScan(code);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <View style={styles.container}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
            onBarcodeScanned={({ data }) => handle(data)}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.denied]}>
            <Text style={styles.deniedText}>
              {permission?.canAskAgain === false
                ? 'Camera access is off. Enable it in Settings, or type the code below.'
                : 'Allow camera access to scan.'}
            </Text>
            {permission?.canAskAgain !== false && <Button title="Allow camera" onPress={() => void requestPermission()} variant="accent" />}
          </View>
        )}
        <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.hint}>{hint}</Text>
            </View>
            <IconButton name="close" color="#fff" label="Close scanner" onPress={onClose} size={28} />
          </View>
          <View style={styles.frame} />
          <View>
            {status}
            <View style={styles.manual}>
              <TextInput
                value={manual}
                onChangeText={setManual}
                placeholder={manualPlaceholder}
                placeholderTextColor="#94a3b8"
                style={styles.input}
                autoCapitalize="characters"
                returnKeyType="done"
                onSubmitEditing={() => manual.trim() && (onScan(manual.trim()), setManual(''))}
              />
              <Pressable
                style={styles.add}
                onPress={() => {
                  if (!manual.trim()) return;
                  onScan(manual.trim());
                  setManual('');
                }}
              >
                <Text style={{ color: colors.ink, fontWeight: '800' }}>Add</Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  denied: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16, backgroundColor: '#0f172a' },
  deniedText: { color: '#fff', textAlign: 'center', fontSize: 15 },
  overlay: { flex: 1, justifyContent: 'space-between' },
  header: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, backgroundColor: 'rgba(15,23,42,0.6)' },
  title: { color: '#fff', fontSize: 18, fontWeight: '800' },
  hint: { color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  frame: {
    alignSelf: 'center',
    width: '75%',
    aspectRatio: 1.4,
    borderColor: 'rgba(255,255,255,0.85)',
    borderWidth: 3,
    borderRadius: radius.xl,
  },
  manual: { flexDirection: 'row', gap: 8, padding: 16, backgroundColor: 'rgba(15,23,42,0.6)' },
  input: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.12)',
    color: '#fff',
    paddingHorizontal: 14,
    fontSize: 16,
  },
  add: { backgroundColor: colors.accent, borderRadius: radius.md, paddingHorizontal: 18, justifyContent: 'center' },
});
