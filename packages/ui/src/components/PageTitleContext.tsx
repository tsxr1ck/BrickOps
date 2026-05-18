import { createContext, useContext, useEffect } from 'react';

export interface PageTitleValue {
  title: string;
  subtitle?: string;
  backTo?: string;
}

export const PageTitleContext = createContext<{
  pageTitle: PageTitleValue;
  setPageTitle: (t: PageTitleValue) => void;
}>({
  pageTitle: { title: '' },
  setPageTitle: () => {},
});

export function usePageTitle(title?: string, backTo?: string, subtitle?: string): PageTitleValue {
  const { setPageTitle, pageTitle } = useContext(PageTitleContext);
  useEffect(() => {
    if (title !== undefined) {
      setPageTitle({ title, backTo, subtitle });
    }
  }, [title, backTo, subtitle, setPageTitle]);
  return pageTitle;
}
