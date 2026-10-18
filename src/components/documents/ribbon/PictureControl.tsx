/**
 * Insert › Pictures: a file picker for a PNG or JPEG, whose bytes go to the editor (addImage,
 * which reads the type from the signature), and whose content id InsertImageFitted then places
 * at the caret, at its own size scaled down to the column.
 */
import { useRef, useState, type ChangeEvent, type RefObject } from 'react';
import { Image } from 'lucide-react';
import type { AddedImage } from '@/lib/cdoc/editor/controller';
import type { RibbonEditor } from './editor-context';
import { MAX_PICTURE_BYTES, PICTURE_TYPES } from './picture';
import { RibbonButton } from './RibbonButton';
import { useRibbon, type Ribbon } from './ribbon-context';

async function added(file: File, editor: RibbonEditor, ribbon: Ribbon): Promise<AddedImage> {
  const bytes: Uint8Array = await ribbon.environment.readBytes(file);
  try {
    return await editor.addImage(bytes, MAX_PICTURE_BYTES);
  } catch (error: unknown) {
    // The engine's decode message is not addressed to anyone; the cause is the file.
    console.warn('[PictureControl] the editor did not take', file.name, error);
    throw new Error(`${file.name} could not be read as a picture.`);
  }
}

async function insertPicture(file: File, editor: RibbonEditor, ribbon: Ribbon): Promise<void> {
  if (!PICTURE_TYPES.includes(file.type)) throw new Error(`${file.name} is not a PNG or JPEG picture.`);
  if (file.size > MAX_PICTURE_BYTES) throw new Error(`${file.name} is larger than ${MAX_PICTURE_BYTES / 1_048_576} MB.`);
  const image: AddedImage = await added(file, editor, ribbon);
  await editor.execute({ name: 'insertImageFitted', contentId: image.contentId });
}

export function PictureControl(): JSX.Element {
  const ribbon: Ribbon = useRibbon();
  const input: RefObject<HTMLInputElement> = useRef<HTMLInputElement>(null);
  const [inserting, setInserting] = useState<boolean>(false);
  return (
    <>
      <RibbonButton testId="ribbon-insert-picture" label="Picture" icon={Image} text={inserting ? 'Inserting…' : 'Picture'}
        unavailable={inserting ? 'A picture is being inserted.' : null} aria-busy={inserting} onPress={(): void => input.current?.click()} />
      <input ref={input} type="file" accept={PICTURE_TYPES.join(',')} hidden data-testid="ribbon-picture-file" aria-label="Picture file"
        onChange={(e: ChangeEvent<HTMLInputElement>): void => {
          const file: File | undefined = e.target.files?.[0];
          e.target.value = '';
          if (file === undefined) return;
          setInserting(true);
          void ribbon.attempt('insert the picture', (editor: RibbonEditor): Promise<void> => insertPicture(file, editor, ribbon)).finally((): void => setInserting(false));
        }} />
    </>
  );
}
