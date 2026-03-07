export default function CancelDialog({
  open,
  onConfirm,
  onDismiss,
}: {
  open: boolean
  onConfirm: () => void
  onDismiss: () => void
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-2xl p-8 flex flex-col items-center gap-6 max-w-sm">
        <p className="text-xl text-white text-center">
          Are you sure you want to cancel?
        </p>
        <div className="flex gap-4">
          <button
            onClick={onConfirm}
            className="rounded-full px-6 py-3 bg-red-600 text-white text-lg font-semibold active:scale-95 transition-transform"
          >
            Yes, cancel
          </button>
          <button
            onClick={onDismiss}
            className="rounded-full px-6 py-3 bg-gray-600 text-white text-lg font-semibold active:scale-95 transition-transform"
          >
            No, go back
          </button>
        </div>
      </div>
    </div>
  )
}
