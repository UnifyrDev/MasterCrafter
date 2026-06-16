import { ref, watch, type Ref } from "vue";

const assetImageSourceCache = new Map<string, string | null>();

export function useAssetImageSource(assetPath: Ref<string | null | undefined>) {
  const source = ref<string | null>(null);
  const loading = ref(false);
  let requestToken = 0;

  watch(
    assetPath,
    async (nextAssetPath) => {
      requestToken += 1;
      const activeToken = requestToken;
      source.value = null;

      if (!nextAssetPath) {
        loading.value = false;
        return;
      }

      const normalizedPath = nextAssetPath.trim();
      const cachedSource = assetImageSourceCache.get(normalizedPath);
      if (cachedSource !== undefined) {
        source.value = cachedSource;
        loading.value = false;
        return;
      }

      loading.value = true;
      try {
        const dataUrl = await window.masterCrafter.assets.readImageDataUrl(normalizedPath);
        if (activeToken !== requestToken) {
          return;
        }

        assetImageSourceCache.set(normalizedPath, dataUrl);
        source.value = dataUrl;
      } catch (error) {
        if (activeToken === requestToken) {
          console.error(`Failed to resolve asset image source for ${normalizedPath}.`, error);
          assetImageSourceCache.set(normalizedPath, null);
          source.value = null;
        }
      } finally {
        if (activeToken === requestToken) {
          loading.value = false;
        }
      }
    },
    { immediate: true },
  );

  return {
    source,
    loading,
  };
}
