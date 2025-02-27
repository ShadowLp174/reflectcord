/* eslint-disable no-multi-assign */
import { NextFunction, Request, Response } from "express";
import { ApiError, HTTPError, FieldError } from "../../common/utils";

const EntityNotFoundErrorRegex = /"(\w+)"/;

export function ErrorHandler(error: Error, req: Request, res: Response, next: NextFunction) {
  if (!error) return next();

  try {
    let code = 400;
    let httpcode = code;
    let message = error?.toString();
    let errors;

    // eslint-disable-next-line no-multi-assign
    if (error instanceof HTTPError && error.code) code = httpcode = error.code;
    else if (error instanceof ApiError) {
      code = error.code;
      message = error.message;
      httpcode = error.httpStatus;
    } else if (error.name === "EntityNotFoundError") {
      message = `${error.message.match(EntityNotFoundErrorRegex)?.[1] || "Item"} could not be found`;
      code = httpcode = 404;
    } else if (error instanceof FieldError) {
      code = Number(error.code);
      message = error.message;
      errors = error.errors;
    } else {
      console.error(`[Error] ${code} ${req.url}\n`, errors || error, "\nbody:", req.body);

      code = httpcode = 500;
    }

    if (httpcode > 511) httpcode = 400;

    res.status(httpcode).json({ code, message, errors });
  } catch (e) {
    console.error("[Internal Server Error] 500", error);
    return res.status(500).json({ code: 500, message: "Internal Server Error" });
  }
}
