import struct
import zipfile

from capstone import CS_ARCH_X86, CS_MODE_32, Cs

ZIP_PATH = "/home/ubuntu/upload/BBSFMEnglishPatch1.0.12.zip"
ENTRY_NAME = "BBS FM English Patch 1.0.12/BBS Patcher.exe"
TEXT_START = 0x1C70
TEXT_END = 0x1E00


def read_u16(data, offset):
    return struct.unpack_from("<H", data, offset)[0]


def read_u32(data, offset):
    return struct.unpack_from("<I", data, offset)[0]


with zipfile.ZipFile(ZIP_PATH) as archive:
    exe = archive.read(ENTRY_NAME)

pe_offset = read_u32(exe, 0x3C)
if exe[pe_offset:pe_offset + 4] != b"PE\0\0":
    raise ValueError("ملف PE غير صالح")
optional_offset = pe_offset + 24
image_base = read_u32(exe, optional_offset + 28)
optional_size = read_u16(exe, pe_offset + 20)
section_offset = optional_offset + optional_size
section_count = read_u16(exe, pe_offset + 6)
sections = []
for index in range(section_count):
    offset = section_offset + index * 40
    sections.append({
        "name": exe[offset:offset + 8].split(b"\0", 1)[0].decode("ascii"),
        "rva": read_u32(exe, offset + 12),
        "raw_size": read_u32(exe, offset + 16),
        "raw_offset": read_u32(exe, offset + 20),
    })

text = next(section for section in sections if section["name"] == ".text")
raw_start = text["raw_offset"] + (TEXT_START - text["rva"])
raw_end = text["raw_offset"] + (TEXT_END - text["rva"])

print("تفكيك ثابت لدالة إدخال الخط فقط؛ لا يُنفذ أي بايت من الباتشر.")
print(f"النطاق: RVA 0x{TEXT_START:08X} إلى 0x{TEXT_END:08X}")
engine = Cs(CS_ARCH_X86, CS_MODE_32)
engine.detail = False
for instruction in engine.disasm(exe[raw_start:raw_end], image_base + TEXT_START):
    print(f"0x{instruction.address:08X}: {instruction.mnemonic:<7} {instruction.op_str}")

font_function = image_base + 0x1CB0
print(f"\nاستدعاءات ثابتة لدالة إدخال الخط 0x{font_function:08X}:")
all_text = exe[text["raw_offset"]:text["raw_offset"] + text["raw_size"]]
all_instructions = list(engine.disasm(all_text, image_base + text["rva"]))
for index, call in enumerate(all_instructions):
    if call.mnemonic != "call" or call.op_str.lower() != hex(font_function):
        continue
    print(f"\nسياق الاستدعاء عند 0x{call.address:08X}:")
    for instruction in all_instructions[max(0, index - 10):index + 8]:
        print(f"0x{instruction.address:08X}: {instruction.mnemonic:<7} {instruction.op_str}")
