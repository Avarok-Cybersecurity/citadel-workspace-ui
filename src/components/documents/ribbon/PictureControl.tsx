/**
 * Insert › Pictures: a file picker for a PNG or JPEG, whose bytes go to the editor's image
 * store (addImage) and whose content id InsertImage then places at the caret, sized by
 * picture.ts. Offered only when the editor can take image bytes: without that, a picture
 * would insert as a reference to nothing.
 */
import { useRef, type ChangeEvent, type RefObject } from 'react';
import { Image } from 'lucide-react';
import type { ImageInsertion } from './editor-context';
import { PICTURE_TYPES, pictureSize } from './picture';
import { RibbonButton } from './RibbonButton';
import { useRibbon, type Ribbon } from './ribbon-context';

async function insertPicture(file: File, ribbon: Ribbon, addImage: ImageInsertion['addImage']): Promise<void> {
  if (!PICTURE_TYPES.includes(file.type)) throw new Error(`${file.name} is not a PNG or JPEG picture.`);
  const size: { width: number; height: number } = pictureSize(await ribbon.environment.imageSize(file));
  const contentId: string = await addImage(await ribbon.environment.readBytes(file), file.type);
  await ribbon.run({ name: 'insertImage', contentId, width: size.width, height: size.height }, 'insert the picture');
}

export function PictureControl(): JSX.Element | null {
  const ribbon: Ribbon = useRibbon();
  const input: RefObject<HTMLInputElement> = useRef<HTMLInputElement>(null);
  const { addImage } = ribbon;
  if (addImage === null) return null;
  return (
    <>
      <RibbonButton testId="ribbon-insert-picture" label="Picture" icon={Image} text="Picture" onPress={(): void => input.current?.click()} />
      <input ref={input} type="file" accept={PICTURE_TYPES.join(',')} hidden data-testid="ribbon-picture-file" aria-label="Picture file"
        onChange={(e: ChangeEvent<HTMLInputElement>): void => {
          const file: File | undefined = e.target.files?.[0];
          e.target.value = '';
          if (file !== undefined) void ribbon.attempt('insert the picture', (): Promise<void> => insertPicture(file, ribbon, addImage));
        }} />
    </>
  );
}
