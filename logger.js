class LOGGER{
    // An array from 0x00 to 0xFF containing information
    // about every possible opcode
    // Format: [mnemonic, addressing mode, documented/unofficial]
    // The opcode number is given by the index
    // Addressing mode:
    // 0:  Immediate
    // 1:  Zero-page
    // 2:  Zero-page X-indexed
    // 3:  Absolute
    // 4:  Absolute X-indexed
    // 5:  Zero-page Y-indexed
    // 6:  Absolute Y-indexed
    // 7:  Indexed Indirect
    // 8:  Indirect Indexed
    // 9:  Relative
    // 10: Accumulator
    // 11: Implied
    // 12: Absolute Indirect
    // Documented/unofficial:
    // true:  Documented
    // false: Unofficial
    static OP_INFO = [
        ["BRK", 11, true ],
        ["ORA",  7, true ],
        ["KIL", 11, false],
        ["SLO",  7, false],
        ["NOP",  1, false],
        ["ORA",  1, true ],
        ["ASL",  1, true ],
        ["SLO",  1, false],
        ["PHP", 11, true ],
        ["ORA",  0, true ],
        ["ASL", 10, true ],
        ["ANC",  0, false],
        ["NOP",  3, false],
        ["ORA",  3, true ],
        ["ASL",  3, true ],
        ["SLO",  3, false],
        ["BPL",  9, true ],
        ["ORA",  8, true ],
        ["KIL", 11, false],
        ["SLO",  8, false],
        ["NOP",  2, false],
        ["ORA",  2, true ],
        ["ASL",  2, true ],
        ["SLO",  2, false],
        ["CLC", 11, true ],
        ["ORA",  6, true ],
        ["NOP", 11, false],
        ["SLO",  6, false],
        ["NOP",  4, false],
        ["ORA",  4, true ],
        ["ASL",  4, true ],
        ["SLO",  4, false],
        ["JSR",  3, true ],
        ["AND",  7, true ],
        ["KIL", 11, false],
        ["RLA",  7, false],
        ["BIT",  1, true ],
        ["AND",  1, true ],
        ["ROL",  1, true ],
        ["RLA",  1, false],
        ["PLP", 11, true ],
        ["AND",  0, true ],
        ["ROL", 10, true ],
        ["ANC",  0, false],
        ["BIT",  3, true ],
        ["AND",  3, true ],
        ["ROL",  3, true ],
        ["RLA",  3, false],
        ["BMI",  9, true ],
        ["AND",  8, true ],
        ["KIL", 11, false],
        ["RLA",  8, false],
        ["NOP",  2, false],
        ["AND",  2, true ],
        ["ROL",  2, true ],
        ["RLA",  2, false],
        ["SEC", 11, true ],
        ["AND",  6, true ],
        ["NOP", 11, false],
        ["RLA",  6, false],
        ["NOP",  4, false],
        ["AND",  4, true ],
        ["ROL",  4, true ],
        ["RLA",  4, false],
        ["RTI", 11, true ],
        ["EOR",  7, true ],
        ["KIL", 11, false],
        ["SRE",  7, false],
        ["NOP",  1, false],
        ["EOR",  1, true ],
        ["LSR",  1, true ],
        ["SRE",  1, false],
        ["PHA", 11, true ],
        ["EOR",  0, true ],
        ["LSR", 10, true ],
        ["ALR",  0, false],
        ["JMP",  3, true ],
        ["EOR",  3, true ],
        ["LSR",  3, true ],
        ["SRE",  3, false],
        ["BVC",  9, true ],
        ["EOR",  8, true ],
        ["KIL", 11, false],
        ["SRE",  8, false],
        ["NOP",  2, false],
        ["EOR",  2, true ],
        ["LSR",  2, true ],
        ["SRE",  2, false],
        ["CLI", 11, true ],
        ["EOR",  6, true ],
        ["NOP", 11, false],
        ["SRE",  6, false],
        ["NOP",  4, false],
        ["EOR",  4, true ],
        ["LSR",  4, true ],
        ["SRE",  4, false],
        ["RTS", 11, true ],
        ["ADC",  7, true ],
        ["KIL", 11, false],
        ["RRA",  7, false],
        ["NOP",  1, false],
        ["ADC",  1, true ],
        ["ROR",  1, true ],
        ["RRA",  1, false],
        ["PLA", 11, true ],
        ["ADC",  0, true ],
        ["ROR", 10, true ],
        ["ARR",  0, false],
        ["JMP", 12, true ],
        ["ADC",  3, true ],
        ["ROR",  3, true ],
        ["RRA",  3, false],
        ["BVS",  9, true ],
        ["ADC",  8, true ],
        ["KIL", 11, false],
        ["RRA",  8, false],
        ["NOP",  2, false],
        ["ADC",  2, true ],
        ["ROR",  2, true ],
        ["RRA",  2, false],
        ["SEI", 11, true ],
        ["ADC",  6, true ],
        ["NOP", 11, false],
        ["RRA",  6, false],
        ["NOP",  4, false],
        ["ADC",  4, true ],
        ["ROR",  4, true ],
        ["RRA",  4, false],
        ["NOP",  0, false],
        ["STA",  7, true ],
        ["NOP",  0, false],
        ["SAX",  7, false],
        ["STY",  1, true ],
        ["STA",  1, true ],
        ["STX",  1, true ],
        ["SAX",  1, false],
        ["DEY", 11, true ],
        ["NOP",  0, false],
        ["TXA", 11, true ],
        ["XAA",  0, false],
        ["STY",  3, true ],
        ["STA",  3, true ],
        ["STX",  3, true ],
        ["SAX",  3, false],
        ["BCC",  9, true ],
        ["STA",  8, true ],
        ["KIL", 11, false],
        ["AHX",  8, false],
        ["STY",  2, true ],
        ["STA",  2, true ],
        ["STX",  5, true ],
        ["SAX",  5, false],
        ["TYA", 11, true ],
        ["STA",  6, true ],
        ["TXS", 11, true ],
        ["TAS",  6, false],
        ["SHY",  4, false],
        ["STA",  4, true ],
        ["SHX",  6, false],
        ["AHX",  6, false],
        ["LDY",  0, true ],
        ["LDA",  7, true ],
        ["LDX",  0, true ],
        ["LAX",  7, false],
        ["LDY",  1, true ],
        ["LDA",  1, true ],
        ["LDX",  1, true ],
        ["LAX",  1, false],
        ["TAY", 11, true ],
        ["LDA",  0, true ],
        ["TAX", 11, true ],
        ["LAX",  0, true ],
        ["LDY",  3, true ],
        ["LDA",  3, true ],
        ["LDX",  3, true ],
        ["LAX",  3, false],
        ["BCS",  9, true ],
        ["LDA",  8, true ],
        ["KIL", 11, false],
        ["LAX",  8, false],
        ["LDY",  2, true ],
        ["LDA",  2, true ],
        ["LDX",  5, true ],
        ["LAX",  5, false],
        ["CLV", 11, true ],
        ["LDA",  6, true ],
        ["TSX", 11, true ],
        ["LAS",  6, false],
        ["LDY",  4, true ],
        ["LDA",  4, true ],
        ["LDX",  6, true ],
        ["LAX",  6, false],
        ["CPY",  0, true ],
        ["CMP",  7, true ],
        ["NOP",  0, false],
        ["DCP",  7, false],
        ["CPY",  1, true ],
        ["CMP",  1, true ],
        ["DEC",  1, true ],
        ["DCP",  1, false],
        ["INY", 11, true ],
        ["CMP",  0, true ],
        ["DEX", 11, true ],
        ["SBX",  0, false],
        ["CPY",  3, true ],
        ["CMP",  3, true ],
        ["DEC",  3, true ],
        ["DCP",  3, false],
        ["BNE",  9, true ],
        ["CMP",  8, true ],
        ["KIL", 11, false],
        ["DCP",  8, false],
        ["NOP",  2, false],
        ["CMP",  2, true ],
        ["DEC",  2, true ],
        ["DCP",  2, false],
        ["CLD", 11, true ],
        ["CMP",  6, true ],
        ["NOP", 11, false],
        ["DCP",  6, false],
        ["NOP",  4, false],
        ["CMP",  4, true ],
        ["DEC",  4, true ],
        ["DCP",  4, false],
        ["CPX",  0, true ],
        ["SBC",  7, true ],
        ["NOP",  0, false],
        ["ISC",  7, false],
        ["CPX",  1, true ],
        ["SBC",  1, true ],
        ["INC",  1, true ],
        ["ISC",  1, false],
        ["INX", 11, true ],
        ["SBC",  0, true ],
        ["NOP", 11, true ],
        ["SBC",  0, false],
        ["CPX",  3, true ],
        ["SBC",  3, true ],
        ["INC",  3, true ],
        ["ISC",  3, false],
        ["BEQ",  9, true ],
        ["SBC",  8, true ],
        ["KIL", 11, false],
        ["ISC",  8, false],
        ["NOP",  2, false],
        ["SBC",  2, true ],
        ["INC",  2, true ],
        ["ISC",  2, false],
        ["SED", 11, true ],
        ["SBC",  6, true ],
        ["NOP", 11, false],
        ["ISC",  6, false],
        ["NOP",  4, false],
        ["SBC",  4, true ],
        ["INC",  4, true ],
        ["ISC",  4, false],
    ];

    // Specifies the amount of bytes used by each addressing mode
    static ADDR_MODE_BYTES = [1, 1, 1, 2, 2, 1, 2, 1, 1, 1, 0, 0, 2];

    // The format string to put the opcode's arguments in
    static ADDR_MODE_FORMAT = [
        "#${}",
        "${}",
        "${},X",
        "${}",
        "${},X",
        "${},Y",
        "${},Y",
        "(${},X)",
        "(${}),Y",
        "${}",
        "",
        "",
        "(${})",
    ];

    static MAX_LOG_CHUNK_LENGTH = Math.pow(2, 28);
    
    constructor(p_nes){
        this.nes = p_nes;
        this.log = "";
        this.log_index = 0;
    }

    cpu_log(){
        let res = "";
        let pc = this.nes.cpu.prg_counter;
        let opcode = this.nes.mmap.get_byte(pc);
        let info = LOGGER.OP_INFO[opcode];
        res += hx_fmt(pc    , 1) + "  ";
        res += hx_fmt(opcode   ) + " " ;
        let bytes_used = LOGGER.ADDR_MODE_BYTES[info[1]];
        let arg = 0x0000;
        if      (bytes_used == 0){
            res += "      ";
        }
        else if (bytes_used == 1){
            arg = this.nes.mmap.get_byte(pc + 1);
            res += hx_fmt(arg) + "    ";
            if (info[1] == 9){
                arg = (pc + 2 + (((arg & 0x80) ? 0xFF00 : 0x0000) | arg)) & 0xFFFF;
            }
        }
        else if (bytes_used == 2){
            let low  = this.nes.mmap.get_byte(pc + 1);
            let high = this.nes.mmap.get_byte(pc + 2);
            res += hx_fmt(low) + " " + hx_fmt(high) + " ";
            arg = (high << 8) | low;
        }
        res += info[2] ? " " : "*";
        res += info[0] + " ";
        let double = (bytes_used == 2) || (info[1] == 9);
        res += LOGGER.ADDR_MODE_FORMAT[info[1]].replace("{}", hx_fmt(arg, double)).padEnd(9, " ");
        res += "A:" + hx_fmt(this.nes.cpu.acc)         + " ";
        res += "X:" + hx_fmt(this.nes.cpu.x_reg)       + " ";
        res += "Y:" + hx_fmt(this.nes.cpu.y_reg)       + " ";
        res += "P:" + hx_fmt(this.nes.cpu.proc_status) + " ";
        res += "S:" + hx_fmt(this.nes.cpu.stack_ptr)   + " ";
        this.log += res + "\n";
        if (this.log.length >= LOGGER.MAX_LOG_CHUNK_LENGTH){
            download("visnes_log_part_" + this.log_index + ".log", [this.log]);
            this.log = "";
            this.log_index++;
        }
    }
}
