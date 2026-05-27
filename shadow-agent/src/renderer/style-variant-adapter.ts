import { cva, type VariantProps } from 'class-variance-authority';

export interface StyleVariantAdapter {
  readonly id: string;
  readonly createClassVariants: typeof cva;
}

const classVarianceAuthorityAdapter: StyleVariantAdapter = {
  id: 'class-variance-authority',
  createClassVariants: cva
};

export function getStyleVariantAdapter(): StyleVariantAdapter {
  return classVarianceAuthorityAdapter;
}

export const createClassVariants = classVarianceAuthorityAdapter.createClassVariants;
export type { VariantProps };
