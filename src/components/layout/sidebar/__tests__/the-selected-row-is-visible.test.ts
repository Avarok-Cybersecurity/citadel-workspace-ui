/**
 * The sidebar's "you are here" has to be visible, and it has to be one thing.
 *
 * Every row in the sidebar -- tree nodes, peer conversations, group
 * conversations -- marked the current one with `bg-primary-accent/20` and
 * nothing else. Composited over the sidebar's own background, measured in a
 * browser:
 *
 *   selection tint against the sidebar   1.37 : 1
 *   active text against idle text        2.86 : 1
 *
 * WCAG 1.4.11 asks 3:1 of any state a control uses to convey information. The
 * state was really being carried by the text colour alone. With the left rule:
 *
 *   selection rule against the sidebar   6.38 : 1
 *   text on the selected row             4.67 : 1
 *
 * Those numbers come from `getComputedStyle` in a real browser over the built
 * stylesheet, because a tint's contrast cannot be computed from the class name
 * and jsdom composites nothing. What THIS file pins is the property that broke
 * the first attempt, which is testable here: the two states must not both set
 * the same property and leave the stylesheet's order to decide.
 */
import { describe, it, expect } from 'vitest';
import { rowClass } from '../selected-row';

const classesOf = (isSelected: boolean): string[] => rowClass(isSelected).split(/\s+/);

describe('rowClass', () => {
  it('gives the selected row a rule in the accent colour', () => {
    expect(classesOf(true)).toContain('border-l-primary-accent');
  });

  it('reserves the rule on every row, so selecting one moves nothing', () => {
    expect(classesOf(false)).toContain('border-l-2');
    expect(classesOf(true)).toContain('border-l-2');
    expect(classesOf(false)).toContain('border-l-transparent');
  });

  it('never emits both border colours at once', () => {
    // The first attempt put the transparent rule in a shared base string and
    // the accent one in the selected string. Both landed in the same class
    // attribute, and which won was decided by their order in the stylesheet:
    // measured at 1:1 against the sidebar, exactly as invisible as the tint it
    // replaced. Mutually exclusive classes cannot be reordered into each other.
    for (const selected of [true, false]) {
      const classes: string[] = classesOf(selected);
      const colours: string[] = classes.filter((c) => c.startsWith('border-l-') && c !== 'border-l-2');
      expect(colours).toHaveLength(1);
    }
  });

  it('does not put the accent text colour on an idle row', () => {
    expect(classesOf(false)).toContain('text-foreground');
    expect(classesOf(false)).not.toContain('text-primary-accent');
  });
});
