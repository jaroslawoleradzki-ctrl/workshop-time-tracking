import { CSSProperties, ReactNode, useEffect, useRef, useState } from 'react';

interface ScrollableTableProps {
  children: ReactNode;
  ariaLabel: string;
  tableClassName?: string;
  containerStyle?: CSSProperties;
}

export default function ScrollableTable({
  children,
  ariaLabel,
  tableClassName = '',
  containerStyle,
}: ScrollableTableProps) {
  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const isSyncingScroll = useRef(false);
  const [tableWidth, setTableWidth] = useState(0);

  const handleTopScroll = () => {
    if (!topScrollRef.current || !tableScrollRef.current) return;
    if (isSyncingScroll.current) {
      isSyncingScroll.current = false;
      return;
    }
    isSyncingScroll.current = true;
    tableScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
  };

  const handleTableScroll = () => {
    if (!topScrollRef.current || !tableScrollRef.current) return;
    if (isSyncingScroll.current) {
      isSyncingScroll.current = false;
      return;
    }
    isSyncingScroll.current = true;
    topScrollRef.current.scrollLeft = tableScrollRef.current.scrollLeft;
  };

  useEffect(() => {
    const updateWidth = () => {
      if (tableRef.current) setTableWidth(tableRef.current.offsetWidth);
    };

    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    if (tableRef.current) observer.observe(tableRef.current);
    if (tableScrollRef.current) observer.observe(tableScrollRef.current);
    return () => observer.disconnect();
  }, [children]);

  return (
    <div className="scrollable-table-layout">
      <div
        ref={topScrollRef}
        onScroll={handleTopScroll}
        className="top-scrollbar-custom scrollable-table-top"
        data-testid={`${ariaLabel}-top-scrollbar`}
        aria-label={`${ariaLabel} — górny pasek przewijania`}
      >
        <div style={{ width: `${tableWidth}px`, height: '1px' }} />
      </div>

      <div
        ref={tableScrollRef}
        onScroll={handleTableScroll}
        className="table-container-fixed top-scrollbar-custom"
        style={containerStyle}
        data-testid={`${ariaLabel}-table-scrollbar`}
      >
        <table
          ref={tableRef}
          className={`table-fixed table-scroll-wide ${tableClassName}`.trim()}
          aria-label={ariaLabel}
        >
          {children}
        </table>
      </div>
    </div>
  );
}
