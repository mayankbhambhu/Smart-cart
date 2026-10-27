import { initials, timeAgo, type ShoppingList, type ShoppingListSummary } from '@smartcart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { colors, radius, space } from '@/components/theme';
import { Button, Card, EmptyState, Field, Loader, Muted, Row, Sheet } from '@/components/ui';
import { customerApi, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { toast } from '@/lib/toast';

const EMOJIS = ['🛒', '🏠', '🥦', '🍎', '🥛', '🎉', '🍳', '🧺', '👶', '🐶'];

/** Shared family lists: changes sync live to everyone on the list, including the shopper in the store. */
export default function ListsScreen() {
  const router = useRouter();
  const session = useSession('CUSTOMER');
  const {
    data: lists,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['lists'],
    queryFn: () => customerApi.get<ShoppingListSummary[]>('/lists'),
    enabled: Boolean(session),
  });
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);

  if (!session) {
    return (
      <EmptyState
        emoji="📝"
        title="Family shopping lists"
        body="Make a list, share the code with your family, and see every change live, even while someone is in the store."
        action={<Button title="Log in" onPress={() => router.push('/login')} />}
      />
    );
  }
  if (isLoading) return <Loader />;
  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={lists ?? []}
        keyExtractor={(l) => l.id}
        contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.brand} />}
        ListHeaderComponent={
          <View style={{ gap: space.md }}>
            <Muted>Shared lists sync live. When someone adds milk at home, it shows up on the shopper's phone in the store.</Muted>
            <Row>
              <Button title="New list" icon="add" style={{ flex: 1 }} onPress={() => setCreating(true)} />
              <Button title="Join with code" icon="people" variant="outline" style={{ flex: 1 }} onPress={() => setJoining(true)} />
            </Row>
          </View>
        }
        ListEmptyComponent={
          <EmptyState emoji="📝" title="No lists yet" body="Create a list and share the code with your family to shop together." />
        }
        renderItem={({ item: list }) => (
          <Card onPress={() => router.push(`/list/${list.id}`)}>
            <Row gap={space.md}>
              <View style={styles.emoji}>
                <Text style={{ fontSize: 24 }}>{list.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', fontSize: 16, color: colors.ink }} numberOfLines={1}>
                  {list.name}
                </Text>
                <Muted>
                  {list.itemCount - list.checkedCount} to buy · {list.checkedCount} done
                </Muted>
              </View>
            </Row>
            <View style={styles.progress}>
              <View style={[styles.progressFill, { width: `${list.itemCount ? (list.checkedCount / list.itemCount) * 100 : 0}%` }]} />
            </View>
            <Row style={{ justifyContent: 'space-between', marginTop: space.md }}>
              <Row gap={0}>
                {list.members.slice(0, 5).map((m, i) => (
                  <View key={m.userId} style={[styles.avatar, { marginLeft: i === 0 ? 0 : -8 }]}>
                    <Text style={styles.avatarText}>{initials(m.name)}</Text>
                  </View>
                ))}
              </Row>
              <Muted style={{ fontSize: 12 }}>Updated {timeAgo(list.updatedAt)}</Muted>
            </Row>
          </Card>
        )}
      />
      <CreateListSheet visible={creating} onClose={() => setCreating(false)} />
      <JoinListSheet visible={joining} onClose={() => setJoining(false)} />
    </View>
  );
}

function CreateListSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState('Weekly groceries');
  const [emoji, setEmoji] = useState('🛒');
  const create = useMutation({
    mutationFn: () => customerApi.post<ShoppingList>('/lists', { name: name.trim(), emoji }),
    onSuccess: (list) => {
      void queryClient.invalidateQueries({ queryKey: ['lists'] });
      onClose();
      router.push(`/list/${list.id}`);
    },
    onError: (error) => toast.error('Could not create the list', errorMessage(error)),
  });
  return (
    <Sheet visible={visible} onClose={onClose} title="New shared list">
      <Field label="Name" value={name} onChangeText={setName} maxLength={60} autoFocus />
      <Text style={styles.label}>Icon</Text>
      <Row style={{ flexWrap: 'wrap' }}>
        {EMOJIS.map((e) => (
          <Pressable
            key={e}
            onPress={() => setEmoji(e)}
            style={[styles.emojiOption, emoji === e && { borderColor: colors.brand, backgroundColor: colors.brandSoft }]}
          >
            <Text style={{ fontSize: 22 }}>{e}</Text>
          </Pressable>
        ))}
      </Row>
      <Button
        title="Create list"
        size="lg"
        style={{ marginTop: space.lg }}
        disabled={!name.trim()}
        loading={create.isPending}
        onPress={() => create.mutate()}
      />
    </Sheet>
  );
}

function JoinListSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const join = useMutation({
    mutationFn: () => customerApi.post<ShoppingList>('/lists/join', { code: code.trim() }),
    onSuccess: (list) => {
      toast.success(`You joined “${list.name}”`);
      void queryClient.invalidateQueries({ queryKey: ['lists'] });
      setCode('');
      onClose();
      router.push(`/list/${list.id}`);
    },
    onError: (error) => toast.error('Could not join', errorMessage(error)),
  });
  return (
    <Sheet visible={visible} onClose={onClose} title="Join a family list">
      <Field
        label="Invite code"
        value={code}
        onChangeText={(t) => setCode(t.toUpperCase())}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={12}
        placeholder="e.g. 7KQ2MX"
        hint="Ask whoever made the list for its code."
        style={{ fontSize: 22, letterSpacing: 6, fontWeight: '800', height: 56 }}
        autoFocus
      />
      <Button title="Join list" size="lg" disabled={code.trim().length < 6} loading={join.isPending} onPress={() => join.mutate()} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  emoji: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progress: { height: 6, borderRadius: 3, backgroundColor: '#f1f5f9', marginTop: space.md, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: colors.brand },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.brandSoft,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 10, fontWeight: '800', color: colors.brandDark },
  label: { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 6 },
  emojiOption: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
});
