import re

with open('src/components/PlanModal.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Make it a fullscreen modal instead of a small popup
content = content.replace(
    '<div className="bg-white rounded-lg shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh]">',
    '<div className="bg-[var(--bg-surface)] rounded-2xl shadow-2xl w-full max-w-7xl overflow-hidden flex flex-col max-h-[95vh] border border-[var(--border-subtle)]">'
)

# Header
content = content.replace(
    '<div className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between">',
    '<div className="bg-[var(--color-primary)] text-white px-6 py-5 flex items-center justify-between shadow-sm z-10">'
)

# Main content layout
content = content.replace(
    '<div className="flex-1 overflow-y-auto p-6 bg-gray-50 text-gray-800">',
    '<div className="flex-1 overflow-y-auto p-6 lg:p-8 bg-[var(--bg-body)] text-[var(--text-primary)]">'
)

# Colors
content = content.replace('text-gray-500', 'text-[var(--text-secondary)]')
content = content.replace('text-gray-400', 'text-[var(--text-tertiary)]')
content = content.replace('text-gray-600', 'text-[var(--text-secondary)]')
content = content.replace('text-gray-700', 'text-[var(--text-primary)]')
content = content.replace('text-gray-800', 'text-[var(--text-primary)]')

content = content.replace('border-gray-200', 'border-[var(--border-subtle)]')
content = content.replace('border-gray-300', 'border-[var(--border-subtle)]')
content = content.replace('bg-gray-50', 'bg-[var(--bg-surface)]')
content = content.replace('bg-gray-100', 'bg-[var(--bg-body)]')
content = content.replace('bg-white', 'bg-[var(--bg-surface)]')

# Buttons
content = content.replace(
    '<button onClick={onClose} className="px-6 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 rounded uppercase">',
    '<button onClick={onClose} className="btn btn-secondary">'
)

content = content.replace(
    '<button onClick={handleGenerate} className="px-6 py-2 text-sm font-semibold text-white bg-blue-400 hover:bg-blue-500 rounded shadow uppercase">',
    '<button onClick={handleGenerate} className="btn btn-primary">'
)

content = content.replace(
    '<div className="bg-[var(--bg-surface)] p-4 border-t border-[var(--border-subtle)] flex justify-between items-center">',
    '<div className="bg-[var(--bg-surface)] p-6 border-t border-[var(--border-subtle)] flex justify-between items-center">'
)

# Inputs
content = re.sub(
    r'className="w-full border-b border-\[var\(--border-subtle\)\] pb-1 focus:outline-none focus:border-blue-500 bg-transparent text-sm"',
    'className="input-field w-full"',
    content
)

content = re.sub(
    r'className="border-b border-\[var\(--border-subtle\)\] pb-1 focus:outline-none focus:border-blue-500 bg-transparent text-sm min-w-\[150px\]"',
    'className="input-field min-w-[150px]"',
    content
)

with open('src/components/PlanModal.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
