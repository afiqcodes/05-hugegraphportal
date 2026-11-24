import { ChevronLeft, ChevronRight } from './Icons';

export default function Pagination({ page, hasNext, onPrev, onNext, disabled = false }) {
  return (
    <div className="pagination">
      <button onClick={onPrev} disabled={!page || disabled} aria-label="Previous page">
        <ChevronLeft size={16} />
      </button>
      <span>Page {page + 1}</span>
      <button onClick={onNext} disabled={!hasNext || disabled} aria-label="Next page">
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
