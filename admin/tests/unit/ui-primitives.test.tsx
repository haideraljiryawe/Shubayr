// @vitest-environment jsdom
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button, DialogShell, FilePicker, Select } from "@/components/ui";
import { AmountInput } from "@/components/forms/amount-input";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { TableFooter } from "@/components/table/table-footer";
import { renderIn } from "./render";

/* ------------------------------------------------------------------ Select */
function Fruit({ onChange }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <Select
      value={value}
      aria-label="Fruit"
      data-testid="fruit"
      onValueChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    >
      <option value="">Choose…</option>
      <optgroup label="Sweet">
        <option value="apple">Apple</option>
        <option value="banana">Banana</option>
      </optgroup>
      <option value="lemon" disabled>
        Lemon
      </option>
    </Select>
  );
}

describe("Select (VIS-005)", () => {
  it("opens from the keyboard, moves with the arrows and selects with Enter", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderIn("en", <Fruit onChange={onChange} />);
    const trigger = screen.getByTestId("fruit");
    expect(trigger).toHaveProperty("textContent", "Choose…");
    trigger.focus();
    await user.keyboard("{Enter}");
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getByText("Sweet")).toBeTruthy();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("apple");
    expect(trigger.textContent).toBe("Apple");
    expect(trigger.getAttribute("data-value")).toBe("apple");
  });

  it("marks the selected option and keeps disabled ones out of reach", async () => {
    const user = userEvent.setup();
    renderIn("en", <Fruit />);
    await user.click(screen.getByTestId("fruit"));
    await user.click(await screen.findByRole("option", { name: "Banana" }));
    await user.click(screen.getByTestId("fruit"));
    const banana = await screen.findByRole("option", { name: "Banana" });
    expect(banana.getAttribute("aria-selected")).toBe("true");
    expect(banana.getAttribute("data-state")).toBe("checked");
    expect(screen.getByRole("option", { name: "Lemon" }).getAttribute("data-disabled")).not.toBeNull();
  });

  it("an empty option maps back to an empty value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderIn("en", <Fruit onChange={onChange} />);
    await user.click(screen.getByTestId("fruit"));
    await user.click(await screen.findByRole("option", { name: "Apple" }));
    await user.click(screen.getByTestId("fruit"));
    await user.click(await screen.findByRole("option", { name: "Choose…" }));
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("follows the interface direction", async () => {
    const user = userEvent.setup();
    renderIn("ar", <Fruit />);
    expect(screen.getByTestId("fruit").getAttribute("dir")).toBe("rtl");
    await user.click(screen.getByTestId("fruit"));
    expect((await screen.findByRole("listbox")).closest("[dir]")?.getAttribute("dir")).toBe("rtl");
  });

  it("submits its value in a plain form through a hidden input", () => {
    const { container } = renderIn(
      "en",
      <form>
        <Select name="group_by" defaultValue="month">
          <option value="day">Day</option>
          <option value="month">Month</option>
        </Select>
      </form>,
    );
    const hidden = container.querySelector<HTMLInputElement>('input[name="group_by"]');
    expect(hidden?.value).toBe("month");
  });
});

/* ------------------------------------------------------------------ Dialog */
function TwoButtons({ onClose }: { onClose: () => void }) {
  return (
    <DialogShell
      open
      onClose={onClose}
      title="Edit"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button>Save</Button>
        </>
      }
    >
      <input aria-label="Name" />
    </DialogShell>
  );
}

describe("DialogShell (VIS-010)", () => {
  it("moves focus inside, traps Tab, and closes on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderIn("en", (
      <>
        <button>Outside</button>
        <TwoButtons onClose={onClose} />
      </>
    ));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
    for (let i = 0; i < 6; i += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("has a fixed header, a scrolling body and a fixed footer", async () => {
    renderIn("en", <TwoButtons onClose={() => {}} />);
    const dialog = await screen.findByRole("dialog");
    expect(dialog.querySelector("header")).not.toBeNull();
    const body = dialog.querySelector("[data-dialog-body]")!;
    expect(body.className).toContain("overflow-y-auto");
    expect(dialog.querySelector("footer")?.textContent).toContain("Save");
    expect(dialog.className).toContain("max-h-");
  });

  it("names the dialog by its title and offers a translated close button", async () => {
    renderIn("ar", <TwoButtons onClose={() => {}} />);
    const dialog = await screen.findByRole("dialog", { name: "Edit" });
    expect(within(dialog).getByRole("button", { name: "إغلاق" })).toBeTruthy();
  });
});

describe("ConfirmDialog", () => {
  it("does nothing until confirmed, and Cancel leaves everything as it was", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    renderIn("en", (
      <ConfirmDialog open title="Remove?" confirmLabel="Remove" requireReason={false} onConfirm={onConfirm} onClose={onClose} />
    ));
    await user.click(await screen.findByTestId("confirm-cancel"));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("runs the action on confirm", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderIn("en", (
      <ConfirmDialog open title="Remove?" confirmLabel="Remove" requireReason={false} onConfirm={onConfirm} onClose={() => {}} />
    ));
    await user.click(await screen.findByTestId("confirm-submit"));
    expect(onConfirm).toHaveBeenCalledWith("");
  });

  it("asks for a reason when the action is audited", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderIn("en", (
      <ConfirmDialog open title="Delete?" confirmLabel="Delete" onConfirm={onConfirm} onClose={() => {}} />
    ));
    await user.click(await screen.findByTestId("confirm-submit"));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByTestId("error-reason").textContent).toBeTruthy();
    await user.type(screen.getByTestId("confirm-reason"), "duplicate");
    await user.click(screen.getByTestId("confirm-submit"));
    expect(onConfirm).toHaveBeenCalledWith("duplicate");
  });
});

/* ------------------------------------------------------- Table footer copy */
function footer(locale: "ar" | "en", total: number, page = 1, perPage = 20) {
  return renderIn(locale, <TableFooter total={total} page={page} perPage={perPage} onPage={() => {}} onPerPage={() => {}} />);
}

describe("TableFooter copy (VIS-012)", () => {
  it.each([
    ["ar", 0, 1, "لا توجد سجلات"],
    ["en", 0, 1, "No records"],
    ["ar", 1, 1, "سجل واحد"],
    ["en", 1, 1, "1 record"],
    ["ar", 12, 1, "إجمالي السجلات: 12"],
    ["en", 12, 1, "Total records: 12"],
    ["ar", 125, 2, "عرض 21 إلى 40 من أصل 125 سجلاً"],
    ["en", 125, 2, "Showing 21 to 40 of 125 records"],
    ["en", 12500, 3, "Showing 41 to 60 of 12,500 records"],
  ] as const)("%s, %d records, page %d → %j", (locale, total, page, text) => {
    footer(locale, total, page);
    expect(screen.getByTestId("table-range").textContent).toBe(text);
  });

  it("hides navigation when everything fits on one page", () => {
    footer("en", 12);
    expect(screen.queryByTestId("table-previous")).toBeNull();
    expect(screen.queryByTestId("table-page")).toBeNull();
    expect(screen.getByText("Records per page")).toBeTruthy();
  });

  it("disables Previous on the first page and Next on the last", () => {
    const { unmount } = footer("ar", 125, 1);
    expect(screen.getByTestId("table-previous").hasAttribute("disabled")).toBe(true);
    expect(screen.getByTestId("table-next").hasAttribute("disabled")).toBe(false);
    expect(screen.getByTestId("table-page").textContent).toBe("الصفحة 1 من 7");
    unmount();
    footer("en", 125, 7);
    expect(screen.getByTestId("table-next").hasAttribute("disabled")).toBe(true);
    expect(screen.getByTestId("table-page").textContent).toBe("Page 7 of 7");
  });

  it("has no separate jump-to-page field: the page indicator picks the page", async () => {
    const user = userEvent.setup();
    const onPage = vi.fn();
    renderIn("en", <TableFooter total={125} page={1} perPage={20} onPage={onPage} />);
    expect(document.querySelector("#table-go-to")).toBeNull();
    await user.click(screen.getByTestId("table-page"));
    await user.click(await screen.findByRole("option", { name: "Page 5 of 7" }));
    expect(onPage).toHaveBeenCalledWith(5);
  });
});

/* ------------------------------------------------------------- FilePicker */
describe("FilePicker (VIS-024)", () => {
  const xlsx = (name: string) => new File(["x"], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

  it("shows the interface language's button and empty state, not the browser's", () => {
    renderIn("ar", <FilePicker onFiles={() => {}} data-testid="picker" />);
    expect(screen.getByTestId("picker-button").textContent).toBe("اختيار ملف");
    expect(screen.getByTestId("picker-status").textContent).toBe("لم يتم اختيار أي ملف");
  });

  it("shows the chosen filename verbatim and keeps it when the picker is cancelled", () => {
    const onFiles = vi.fn();
    renderIn("en", <FilePicker onFiles={onFiles} data-testid="picker" />);
    expect(screen.getByTestId("picker-status").textContent).toBe("No file selected");
    const input = screen.getByTestId("picker") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [xlsx("منتجات March.xlsx")] } });
    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("picker-status").textContent).toBe("منتجات March.xlsx");
    fireEvent.change(input, { target: { files: [] } }); // cancelled
    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("picker-status").textContent).toBe("منتجات March.xlsx");
  });

  it("counts multiple files and uses the plural button", () => {
    renderIn("en", <FilePicker multiple onFiles={() => {}} data-testid="picker" />);
    expect(screen.getByTestId("picker-button").textContent).toBe("Choose files");
    fireEvent.change(screen.getByTestId("picker"), { target: { files: [xlsx("a.xlsx"), xlsx("b.xlsx"), xlsx("c.xlsx")] } });
    expect(screen.getByTestId("picker-status").textContent).toBe("3 files selected");
  });

  it("follows the caller's selection when it owns it", () => {
    const { rerender } = renderIn("en", <FilePicker onFiles={() => {}} selected={xlsx("a.xlsx")} data-testid="picker" />);
    expect(screen.getByTestId("picker-status").textContent).toBe("a.xlsx");
    rerender(<FilePicker onFiles={() => {}} selected={null} data-testid="picker" />);
    expect(screen.getByTestId("picker-status").textContent).toBe("No file selected");
  });

  it("the button opens the native picker", () => {
    renderIn("en", <FilePicker onFiles={() => {}} data-testid="picker" />);
    const input = screen.getByTestId("picker") as HTMLInputElement;
    const click = vi.spyOn(input, "click");
    fireEvent.click(screen.getByTestId("picker-button"));
    expect(click).toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------ AmountInput */
function Amount({ initial = "", onRaw }: { initial?: string; onRaw?: (raw: string) => void }) {
  const [raw, setRaw] = useState(initial);
  return (
    <AmountInput
      aria-label="Amount"
      value={raw}
      onValueChange={(next) => {
        setRaw(next);
        onRaw?.(next);
      }}
    />
  );
}

describe("AmountInput (VIS-007)", () => {
  it("groups while typing and hands the parent the raw value", async () => {
    const user = userEvent.setup();
    const onRaw = vi.fn();
    renderIn("en", <Amount onRaw={onRaw} />);
    const input = screen.getByLabelText("Amount") as HTMLInputElement;
    await user.type(input, "1250000");
    expect(input.value).toBe("1,250,000");
    expect(onRaw).toHaveBeenLastCalledWith("1250000");
    await user.type(input, ".5");
    expect(input.value).toBe("1,250,000.5");
    expect(onRaw).toHaveBeenLastCalledWith("1250000.5");
  });

  it("ignores a typed comma", async () => {
    const user = userEvent.setup();
    const onRaw = vi.fn();
    renderIn("en", <Amount onRaw={onRaw} />);
    const input = screen.getByLabelText("Amount") as HTMLInputElement;
    await user.type(input, "1,000");
    expect(input.value).toBe("1,000");
    expect(onRaw).toHaveBeenLastCalledWith("1000");
  });

  it("keeps the caret on the digit being edited", async () => {
    const user = userEvent.setup();
    renderIn("en", <Amount initial="1000" />);
    const input = screen.getByLabelText("Amount") as HTMLInputElement;
    await user.click(input);
    input.setSelectionRange(1, 1); // "1|,000"
    await user.keyboard("5");
    expect(input.value).toBe("15,000");
    expect(input.selectionStart).toBe(2); // "15|,000"
  });

  it("deletes the digit before a comma on Backspace", async () => {
    const user = userEvent.setup();
    const onRaw = vi.fn();
    renderIn("en", <Amount initial="1250000" onRaw={onRaw} />);
    const input = screen.getByLabelText("Amount") as HTMLInputElement;
    await user.click(input);
    input.setSelectionRange(2, 2); // "1,|250,000"
    await user.keyboard("{Backspace}");
    expect(onRaw).toHaveBeenLastCalledWith("250000");
    expect(input.value).toBe("250,000");
  });

  it("accepts a grouped paste and keeps an ambiguous one verbatim", async () => {
    const user = userEvent.setup();
    const onRaw = vi.fn();
    renderIn("en", <Amount onRaw={onRaw} />);
    const input = screen.getByLabelText("Amount") as HTMLInputElement;
    await user.click(input);
    await user.paste("1,250,000");
    expect(onRaw).toHaveBeenLastCalledWith("1250000");
    expect(input.value).toBe("1,250,000");
    await user.clear(input);
    await user.paste("1,5");
    expect(onRaw).toHaveBeenLastCalledWith("1,5");
    expect(input.value).toBe("1,5");
  });

  it("normalizes Arabic-Indic digits and is always left-to-right", async () => {
    const user = userEvent.setup();
    const onRaw = vi.fn();
    renderIn("ar", <Amount onRaw={onRaw} />);
    const input = screen.getByLabelText("Amount") as HTMLInputElement;
    expect(input.getAttribute("dir")).toBe("ltr");
    await act(async () => {
      await user.type(input, "١٥٠٠");
    });
    expect(input.value).toBe("1,500");
    expect(onRaw).toHaveBeenLastCalledWith("1500");
  });
});
