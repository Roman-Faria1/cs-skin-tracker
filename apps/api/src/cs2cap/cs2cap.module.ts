import { Module } from "@nestjs/common";

import { Cs2CapService } from "./cs2cap.service.js";

@Module({
  providers: [Cs2CapService],
  exports: [Cs2CapService]
})
export class Cs2CapModule {}
