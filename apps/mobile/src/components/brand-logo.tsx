import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Txt } from '@/components/ui';

// Logos : tracés de Simple Icons (licence CC0). Les marques restent la propriété de leurs titulaires ;
// leur affichage sert seulement à identifier la paire du coureur. Les marques absentes de Simple Icons
// (Asics, Kiprun, Salomon, Brooks, On…) sont représentées par leur nom.
const LOGO_PATHS: Record<string, string> = {
  Nike: 'M24 7.8L6.442 15.276c-1.456.616-2.679.925-3.668.925-1.12 0-1.933-.392-2.437-1.177-.317-.504-.41-1.143-.28-1.918.13-.775.476-1.6 1.036-2.478.467-.71 1.232-1.643 2.297-2.8a6.122 6.122 0 00-.784 1.848c-.28 1.195-.028 2.072.756 2.632.373.261.886.392 1.54.392.522 0 1.11-.084 1.764-.252L24 7.8z',
  Adidas: 'm24 19.535-8.697-15.07-4.659 2.687 7.145 12.383Zm-8.287 0L9.969 9.59 5.31 12.277l4.192 7.258ZM4.658 14.723l2.776 4.812H1.223L0 17.41Z',
  Puma: 'M23.845 3.008c-.417-.533-1.146-.106-1.467.08-2.284 1.346-2.621 3.716-3.417 5.077-.626 1.09-1.652 1.89-2.58 1.952-.686.049-1.43-.084-2.168-.405-1.807-.781-2.78-1.792-3.017-1.97-.487-.37-4.23-4.015-7.28-4.164 0 0-.372-.75-.465-.763-.222-.025-.45.451-.616.501-.15.053-.413-.512-.565-.487-.153.02-.302.586-.6.877-.22.213-.486.2-.637.463-.052.096-.034.265-.093.42-.127.32-.551.354-.555.697 0 .381.357.454.669.72.248.212.265.362.554.461.258.088.632-.187.964-.088.277.081.543.14.602.423.054.256 0 .658-.34.613-.112-.015-.598-.174-1.198-.11-.725.077-1.553.309-1.634 1.11-.041.447.514.97 1.055.866.371-.071.196-.506.399-.716.267-.27 1.772.944 3.172.944.593 0 1.031-.15 1.467-.605.04-.029.093-.102.155-.11a.632.632 0 01.195.088c1.131.897 1.984 2.7 6.13 2.721.582.007 1.25.279 1.796.777.48.433.764 1.125 1.037 1.825.418 1.053 1.161 2.069 2.292 3.203.06.068.99.78 1.06.833.012.01.084.167.053.255-.02.69-.123 2.67 1.365 2.753.366.02.275-.231.275-.41-.005-.341-.065-.685.113-1.04.253-.478-.526-.709-.509-1.756.019-.784-.645-.651-.984-1.25-.19-.343-.368-.532-.35-.946.073-2.38-.517-3.948-.805-4.327-.227-.294-.423-.403-.207-.54 1.24-.815 1.525-1.574 1.525-1.574.66-1.541 1.256-2.945 2.075-3.57.166-.12.589-.44.852-.56.763-.362 1.173-.578 1.388-.788.356-.337.635-1.053.294-1.48z',
};

/** Vignette de marque : logo quand il est disponible, sinon le nom de la marque. */
export function BrandLogo({ brand, size = 44, color = '#FFFFFF', bg = '#111318' }: { brand: string; size?: number; color?: string; bg?: string }) {
  const path = LOGO_PATHS[brand];
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={brand}
      style={[styles.tile, { width: size, height: size, borderRadius: size * 0.28, backgroundColor: bg }]}>
      {path ? (
        <Svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24">
          <Path d={path} fill={color} />
        </Svg>
      ) : (
        <Txt style={{ fontSize: Math.max(8, size * (brand.length > 5 ? 0.2 : 0.26)), fontWeight: '800', letterSpacing: 0.3 }} color={color} numberOfLines={1}>
          {brand === 'Autre' ? '•••' : brand.toUpperCase()}
        </Txt>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', paddingHorizontal: 2 },
});
