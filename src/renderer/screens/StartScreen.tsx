export default function StartScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex items-center justify-center h-screen bg-black">
      <button
        onClick={onStart}
        className="rounded-full w-48 h-48 bg-white text-black text-4xl font-bold shadow-lg active:scale-95 transition-transform"
      >
        Start
      </button>
    </div>
  )
}
