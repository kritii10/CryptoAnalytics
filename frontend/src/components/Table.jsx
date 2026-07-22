import React from "react";

function Table({ columns, rows, renderActions }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[#1F2937] bg-[#111827]">
      <table className="w-full min-w-[700px] text-left text-sm">
        <thead className="bg-[#0F172A] text-[#9CA3AF]">
          <tr>
            {columns.map((column) => (
              <th className="px-5 py-4 font-semibold" key={column.key}>
                {column.label}
              </th>
            ))}
            {renderActions && <th className="px-5 py-4 font-semibold">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="border-t border-[#1F2937]" key={row.id || row.coin_id || row.month || row.year}>
              {columns.map((column) => (
                <td className="px-5 py-4 text-[#F9FAFB]" key={column.key}>
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
              {renderActions && <td className="px-5 py-4">{renderActions(row)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default Table;
