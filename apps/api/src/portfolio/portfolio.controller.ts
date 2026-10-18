import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query
} from "@nestjs/common";
import { holdingInputSchema } from "@csst/shared";
import { z } from "zod";
import { PortfolioRepository } from "./portfolio.repository.js";

@Controller("portfolio")
export class PortfolioController {
  constructor(@Inject(PortfolioRepository) private readonly portfolio: PortfolioRepository) {}
  @Get() list(@Query("providerId") providerId?: unknown) {
    const parsed = z.string().min(1).max(80).optional().safeParse(providerId);
    if (!parsed.success) throw new BadRequestException("Invalid market provider");
    return this.portfolio.list(parsed.data ?? null);
  }
  @Post() create(@Body() body: unknown) {
    return this.portfolio.save(parse(body));
  }
  @Put(":id") update(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.portfolio.save(parse(body), id);
  }
  @Delete(":id") remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.portfolio.remove(id);
  }
}
function parse(body: unknown) {
  const parsed = holdingInputSchema.safeParse(body);
  if (!parsed.success)
    throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join("; "));
  return parsed.data;
}
